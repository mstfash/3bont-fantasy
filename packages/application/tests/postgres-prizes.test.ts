import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { prizeCommandSchema, type PrizePool } from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { executePrizeCommand } from '../src/prize-commands.ts';
import { readPrizeAdministration } from '../src/prize-query.ts';
import { executeMatchDataCommand } from '../src/match-data.ts';
import { CommandRejected } from '../src/errors.ts';
import { allocatePrizeAwards } from '../src/prize-allocation.ts';
import { pointUnits } from '@fantasy/domain';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 6 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
  await grantProofStaff(db, owner.accountId, grants);
  const identity = createIdentity(pool, {
    baseURL: 'http://127.0.0.1:3100',
    secret: randomUUID() + randomUUID(),
    secureCookies: false,
    sendMail: async () => {},
  });
  await migrateIdentity(identity);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const owner = {
    accountId: 'prize-preparer',
    sessionId: 'prize-session',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  },
  grants = [{ role: 'owner' as const, competitionId: null }];
const reject = (code: string) => (error: unknown) =>
  error instanceof CommandRejected && error.code === code;
async function fixture() {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const rounds = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', competition.id)
    .orderBy('number')
    .execute();
  const first = rounds.find((r) => r.data.status === 'upcoming')?.data;
  assert.ok(first);
  const entries = await db
    .selectFrom('entries')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  for (const { data: e } of entries)
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) ON CONFLICT(id) DO UPDATE SET "emailVerified"=true',
      [e.accountId, e.name, `${e.accountId}@prize-proof.test`],
    );
  const created = await executePrizeCommand(
    db,
    owner,
    grants,
    prizeCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      name: { ar: 'جائزة تجريبية', en: 'Rehearsal award' },
      description: {
        ar: 'شروط تجريبية بلا أموال حقيقية',
        en: 'Synthetic terms with no real money',
      },
      firstGameweekId: first.id,
      lastGameweekId: first.id,
      groupId: null,
      eligibilityCutoff: first.deadline,
      currency: 'EGP',
      places: [
        { kind: 'cash', amountMinor: 10001 },
        { kind: 'cash', amountMinor: 5000 },
      ],
      oneAwardPerAccount: true,
      reason: 'Reviewed synthetic award pool',
    }),
  );
  await executePrizeCommand(db, owner, grants, {
    kind: 'publish',
    commandId: randomUUID(),
    competitionId: competition.id,
    poolId: created.poolId,
    expectedRevision: 1,
    evidenceReference: 'Synthetic rehearsal only, no real award',
    reason: 'Publish synthetic terms before opening',
  });
  const published = (
    await db
      .selectFrom('prize_pools')
      .select('data')
      .where('id', '=', created.poolId)
      .executeTakeFirstOrThrow()
  ).data;
  // Time-travel only this disposable pool to the replay's already finalized interval.
  const completed = rounds
    .filter((r) => r.data.status === 'finalized')
    .slice(0, 3)
    .map((r) => r.data.id);
  assert.equal(completed.length, 3);
  const data: PrizePool = {
    ...published,
    gameweekIds: completed,
    firstGameweekId: completed[0] ?? first.id,
    lastGameweekId: completed[2] ?? first.id,
    eligibilityCutoff: rounds[0]?.data.deadline ?? new Date().toISOString(),
  };
  await db
    .updateTable('prize_pools')
    .set({ data })
    .where('id', '=', data.id)
    .execute();
  return { competition, prize: data, entries: entries.map((e) => e.data) };
}
void test('prizes freeze terms, bind reviewed final revisions, require another approver and preserve external fulfillment receipts', async () => {
  const f = await fixture();
  const info = await readPrizeAdministration(db, owner, grants, f.prize.id);
  assert.ok(info.preview, info.hold ?? 'missing preview');
  assert.equal(info.hold, null);
  assert.ok(info.preview.awards.length > 0);
  const base = {
    commandId: randomUUID(),
    competitionId: f.competition.id,
    reason: 'Review prize operation evidence',
  };
  await assert.rejects(
    executePrizeCommand(db, owner, grants, {
      ...base,
      kind: 'publish',
      poolId: f.prize.id,
      expectedRevision: 2,
      evidenceReference: 'Cannot republish changed terms',
    }),
    reject('prize-terms-frozen'),
  );
  const prepared = await executePrizeCommand(db, owner, grants, {
    ...base,
    kind: 'prepare',
    poolId: f.prize.id,
    expectedRevision: 2,
    expectedFingerprint: info.preview.fingerprint,
  });
  assert.ok(prepared.proposalId);
  const proposalId = prepared.proposalId;
  await executePrizeCommand(db, owner, grants, {
    ...base,
    commandId: randomUUID(),
    kind: 'review',
    proposalId,
    expectedRevision: 1,
  });
  await assert.rejects(
    executePrizeCommand(db, owner, grants, {
      ...base,
      commandId: randomUUID(),
      kind: 'approve',
      proposalId,
      expectedRevision: 2,
    }),
    reject('prize-distinct-approver-required'),
  );
  const recipient = info.preview.awards[0]?.accountId;
  assert.ok(recipient);
  await grantProofStaff(db, recipient, grants);
  await assert.rejects(
    executePrizeCommand(db, { ...owner, accountId: recipient }, grants, {
      ...base,
      commandId: randomUUID(),
      kind: 'approve',
      proposalId,
      expectedRevision: 2,
    }),
    reject('prize-self-award'),
  );
  const approver = { ...owner, accountId: 'prize-independent-approver' };
  await grantProofStaff(db, approver.accountId, grants);
  await executePrizeCommand(db, approver, grants, {
    ...base,
    commandId: randomUUID(),
    kind: 'approve',
    proposalId,
    expectedRevision: 2,
  });
  const fulfill = {
    ...base,
    commandId: randomUUID(),
    kind: 'fulfill' as const,
    proposalId,
    expectedRevision: 3,
    reference: 'External rehearsal receipt DEMO-001; no funds transferred',
  };
  const fulfilled = await executePrizeCommand(db, owner, grants, fulfill);
  assert.deepEqual(
    await executePrizeCommand(db, owner, grants, fulfill),
    fulfilled,
  );
  assert.equal(
    (
      await db
        .selectFrom('prize_proposals')
        .select('data')
        .where('id', '=', proposalId)
        .executeTakeFirstOrThrow()
    ).data.state,
    'fulfilled',
  );
  await assert.rejects(
    executePrizeCommand(db, owner, grants, {
      ...base,
      commandId: randomUUID(),
      kind: 'void',
      proposalId,
      expectedRevision: 4,
    }),
    reject('prize-transition-unavailable'),
  );
});
void test('prize approval detects unseen factual corrections before the scoring worker runs', async () => {
  const f = await fixture(),
    info = await readPrizeAdministration(db, owner, grants, f.prize.id);
  assert.ok(info.preview, info.hold ?? 'missing preview');
  const prepared = await executePrizeCommand(db, owner, grants, {
    kind: 'prepare',
    commandId: randomUUID(),
    competitionId: f.competition.id,
    poolId: f.prize.id,
    expectedRevision: 2,
    expectedFingerprint: info.preview.fingerprint,
    reason: 'Prepare before provider correction',
  });
  assert.ok(prepared.proposalId);
  const assigned = await db
    .selectFrom('fixture_assignments')
    .select('fixture_id')
    .where('gameweek_id', '=', f.prize.gameweekIds[0] ?? '')
    .executeTakeFirstOrThrow();
  const observation = await db
    .selectFrom('fixture_observations')
    .select('payload')
    .where('fixture_id', '=', assigned.fixture_id)
    .orderBy('revision', 'desc')
    .executeTakeFirstOrThrow();
  const performance = observation.payload.performances[0];
  assert.ok(performance);
  const before = await db
    .selectFrom('fact_revisions')
    .select('revision')
    .where('fixture_id', '=', assigned.fixture_id)
    .where('footballer_id', '=', performance.footballerId)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  await executeMatchDataCommand(db, owner, grants, {
    kind: 'override',
    commandId: randomUUID(),
    fixtureId: assigned.fixture_id,
    footballerId: performance.footballerId,
    expectedRevision: before?.revision ?? 0,
    change: {
      kind: 'performance',
      statistics: {
        ...performance.statistics,
        assists: (performance.statistics.assists ?? 0) + 1,
      },
      discipline: performance.discipline,
    },
    reason: 'Provider discrepancy received after award preparation',
  });
  await assert.rejects(
    executePrizeCommand(db, owner, grants, {
      kind: 'review',
      commandId: randomUUID(),
      competitionId: f.competition.id,
      proposalId: prepared.proposalId,
      expectedRevision: 1,
      reason: 'Try stale award approval',
    }),
    reject('prize-facts-changed'),
  );
  await executeMatchDataCommand(db, owner, grants, {
    kind: 'override',
    commandId: randomUUID(),
    fixtureId: assigned.fixture_id,
    footballerId: performance.footballerId,
    expectedRevision: (before?.revision ?? 0) + 1,
    change: { kind: 'release-override' },
    reason: 'Restore the shared replay fixture after the proof',
  });
  // Release also changes evidence identity, so refresh the source calculation fingerprints for subsequent tests.
  const { calculateRoundInputs } = await import('../src/round-inputs.ts');
  for (const id of f.prize.gameweekIds)
    await db.transaction().execute(async (tx) => {
      const round = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', id)
          .executeTakeFirstOrThrow()
      ).data;
      const inputs = await calculateRoundInputs(tx, round);
      const calc = await tx
        .selectFrom('round_calculations')
        .select('payload')
        .where('gameweek_id', '=', id)
        .where('revision', '=', round.resultRevision)
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('round_calculations')
        .set({ payload: { ...calc.payload, fingerprint: inputs.fingerprint } })
        .where('gameweek_id', '=', id)
        .where('revision', '=', round.resultRevision)
        .execute();
    });
});
void test('cash and goods ties pool equivalent values, preserve residue and deduplicate accounts before ranking', async () => {
  const f = await fixture();
  const candidate = (n: number, accountId: string) => ({
    entryId: randomUUID(),
    accountId,
    entryName: `Entry ${String(n)}`,
    points: pointUnits(n),
    transferDeductions: pointUnits(0),
    effectiveGoals: 0,
    eligible: true,
    reasons: [],
  });
  const tied = [candidate(100, 'a'), candidate(100, 'a'), candidate(100, 'b')];
  const awards = allocatePrizeAwards(f.prize, tied);
  assert.equal(awards.awards.length, 2);
  assert.equal(awards.residueMinor, 1);
  assert.ok(
    awards.awards.every(
      (a) => a.reward.kind === 'cash' && a.reward.amountMinor === 7500,
    ),
  );
  const goods = {
    ...f.prize,
    places: [
      {
        kind: 'goods' as const,
        name: { ar: 'قميص', en: 'Shirt' },
        cashEquivalentMinor: null,
      },
    ],
  };
  assert.deepEqual(allocatePrizeAwards(goods, tied).issues, [
    'goods-tie-needs-resolution:1',
  ]);
  const settlement = allocatePrizeAwards(
    {
      ...goods,
      places: [
        {
          ...goods.places[0],
          kind: 'goods',
          name: { ar: 'قميص', en: 'Shirt' },
          cashEquivalentMinor: 10000,
        },
      ],
    },
    tied,
  );
  assert.equal(settlement.awards.length, 2);
  assert.equal(settlement.issues.length, 0);
});
void test('group prize eligibility uses cutoff history after a member leaves, while later eligibility decisions invalidate proposals', async () => {
  const f = await fixture(),
    first = f.entries[0],
    member = f.entries.find((e) => e.accountId !== first?.accountId);
  assert.ok(first && member);
  const { executeGroupCommand } = await import('../src/group-commands.ts');
  const common = { competitionId: f.competition.id, commandId: randomUUID() };
  const group = await executeGroupCommand(
    db,
    { ...owner, accountId: first.accountId },
    {
      ...common,
      kind: 'create',
      name: 'Prize history proof',
      description: 'Fixed cutoff membership',
      visibility: 'private',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      entryId: first.id,
      invitationToken: 'a'.repeat(64),
    },
  );
  await executeGroupCommand(
    db,
    { ...owner, accountId: member.accountId },
    {
      ...common,
      commandId: randomUUID(),
      kind: 'join',
      groupId: group.groupId,
      entryId: member.id,
      invitationToken: 'a'.repeat(64),
    },
  );
  // Simulate those memberships existing before the historical replay pool's cutoff.
  await db
    .updateTable('group_membership_history')
    .set({
      occurred_at: new Date(Date.parse(f.prize.eligibilityCutoff) - 1000),
    })
    .where('group_id', '=', group.groupId)
    .execute();
  const prize = { ...f.prize, groupId: group.groupId };
  await db
    .updateTable('prize_pools')
    .set({ data: prize, group_id: group.groupId })
    .where('id', '=', prize.id)
    .execute();
  await executeGroupCommand(
    db,
    { ...owner, accountId: member.accountId },
    {
      ...common,
      commandId: randomUUID(),
      kind: 'leave',
      groupId: group.groupId,
      entryId: member.id,
    },
  );
  const detail = await readPrizeAdministration(db, owner, grants, prize.id);
  assert.ok(detail.preview);
  assert.deepEqual(
    new Set(detail.preview.candidates.map((c) => c.entryId)),
    new Set([first.id, member.id]),
  );
  const prepared = await executePrizeCommand(db, owner, grants, {
    kind: 'prepare',
    commandId: randomUUID(),
    competitionId: f.competition.id,
    poolId: prize.id,
    expectedRevision: prize.revision,
    expectedFingerprint: detail.preview.fingerprint,
    reason: 'Prepare cutoff membership proposal',
  });
  assert.ok(prepared.proposalId);
  await executePrizeCommand(db, owner, grants, {
    kind: 'eligibility',
    commandId: randomUUID(),
    competitionId: f.competition.id,
    poolId: prize.id,
    expectedRevision: prize.revision,
    accountId: member.accountId,
    excluded: true,
    evidenceReference: 'Synthetic eligibility review case 123',
    reason: 'Pool terms require documented eligibility review',
  });
  await assert.rejects(
    executePrizeCommand(db, owner, grants, {
      kind: 'review',
      commandId: randomUUID(),
      competitionId: f.competition.id,
      proposalId: prepared.proposalId,
      expectedRevision: 1,
      reason: 'Attempt to use obsolete eligibility',
    }),
    reject('prize-proposal-stale'),
  );
  const current = await readPrizeAdministration(db, owner, grants, prize.id);
  assert.equal(current.hold, 'prize-proposal-stale');
  const { readPublicPrizePool } = await import('../src/prize-query.ts');
  await assert.rejects(readPublicPrizePool(db, prize.id, null));
  const visible = await readPublicPrizePool(db, prize.id, first.accountId);
  assert.equal(visible.pool.evidenceReference, null);
});
void test('prize verification follows the identity connection schema instead of assuming public', async () => {
  const f = await fixture();
  const { sql } = await import('kysely');
  const { calculatePrizePreview } = await import('../src/prize-preview.ts');
  await db.transaction().execute(async (tx) => {
    await sql`CREATE SCHEMA identity_prize_proof`.execute(tx);
    await sql`CREATE TABLE identity_prize_proof."user" AS SELECT id, false AS "emailVerified" FROM public."user"`.execute(
      tx,
    );
    await sql`SET LOCAL search_path=identity_prize_proof,public`.execute(tx);
    const shadow = await calculatePrizePreview(tx, f.prize);
    assert.ok(shadow.candidates.length > 0);
    assert.ok(
      shadow.candidates.every((c) => c.reasons.includes('email-not-verified')),
    );
    await sql`UPDATE identity_prize_proof."user" SET "emailVerified"=true`.execute(
      tx,
    );
    const verified = await calculatePrizePreview(tx, f.prize);
    assert.ok(verified.candidates.every((c) => c.eligible));
    await sql`DROP TABLE identity_prize_proof."user"`.execute(tx);
    await sql`DROP SCHEMA identity_prize_proof`.execute(tx);
  });
});
