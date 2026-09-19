import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  prizePoolSchema,
  prizeProposalSchema,
  type PrizeCorrectionCommand,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { calculatePrizePreview } from '../src/prize-preview.ts';
import { reconcilePrizeCorrections } from '../src/prize-correction-reconciliation.ts';
import { executePrizeCorrection } from '../src/prize-correction-commands.ts';
import { executePrizeCommand } from '../src/prize-commands.ts';
import {
  readPublicPrizePool,
  readPrizeAdministration,
} from '../src/prize-query.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
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
  await migrateIdentity(
    createIdentity(pool, {
      baseURL: 'http://127.0.0.1:3100',
      secret: randomUUID() + randomUUID(),
      secureCookies: false,
      sendMail: async () => {},
    }),
  );
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const rejected = (code: string) => (error: unknown) =>
  error instanceof CommandRejected && error.code === code;
void test('delivered award corrections preserve receipts, reconcile concurrent evidence, require independent current authority and reopen on new evidence', async () => {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const rounds = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('number')
      .execute()
  )
    .map((r) => r.data)
    .filter((r) => r.status === 'finalized');
  assert.ok(rounds.length >= 3);
  const selected = rounds.slice(0, 3);
  const first = selected[0],
    last = selected.at(-1);
  assert.ok(first && last);
  const entries = await db
    .selectFrom('entries')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  for (const { data: e } of entries)
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) ON CONFLICT(id) DO UPDATE SET "emailVerified"=true',
      [e.accountId, e.name, `${e.accountId}@correction-proof.test`],
    );
  const preparer = randomUUID(),
    approver = randomUUID();
  for (const id of [preparer, approver])
    await db
      .insertInto('accounts')
      .values({
        id,
        display_name: 'Correction operator',
        suspended_until: null,
      })
      .execute();
  await db
    .insertInto('staff_grants')
    .values({
      id: randomUUID(),
      account_id: approver,
      role: 'prize-approver',
      competition_id: competition.id,
      granted_by: preparer,
    })
    .execute();
  const principal = {
      accountId: approver,
      sessionId: randomUUID(),
      emailVerified: true,
      authenticatedAt: new Date(),
      mfaVerifiedAt: new Date(),
    },
    grants = [
      { role: 'prize-approver' as const, competitionId: competition.id },
    ];
  // A synthetic previously delivered award is the starting fixture; ordinary delivery is covered in postgres-prizes.
  const terms = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    revision: 2,
    name: { ar: 'جائزة تصحيح', en: 'Correction prize' },
    description: { ar: 'اختبار مصطنع', en: 'Synthetic proof' },
    firstGameweekId: first.id,
    lastGameweekId: last.id,
    groupId: null,
    eligibilityCutoff: first.deadline,
    currency: 'EGP',
    places: [{ kind: 'cash', amountMinor: 10000 }],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: selected.map((r) => r.id),
    publishedAt: new Date(Date.now() - 86400_000).toISOString(),
    evidenceReference: 'Synthetic initial terms',
    ranking: 'shared',
  });
  await db
    .insertInto('prize_pools')
    .values({
      id: terms.id,
      competition_id: competition.id,
      group_id: null,
      revision: 2,
      data: terms,
    })
    .execute();
  const initial = await db
    .transaction()
    .execute((tx) => calculatePrizePreview(tx, terms));
  assert.equal(initial.issues.length, 0);
  const recipient = initial.awards[0];
  assert.ok(recipient);
  const delivered = prizeProposalSchema.parse({
    id: randomUUID(),
    poolId: terms.id,
    competitionId: competition.id,
    revision: 4,
    preview: initial,
    state: 'fulfilled',
    preparedBy: preparer,
    preparedAt: new Date().toISOString(),
    reviewedBy: preparer,
    reviewedAt: new Date().toISOString(),
    approvedBy: approver,
    approvedAt: new Date().toISOString(),
    fulfilledBy: preparer,
    fulfilledAt: new Date().toISOString(),
    fulfillmentReference: 'Synthetic immutable delivery receipt',
  });
  await db
    .insertInto('prize_proposals')
    .values({
      id: delivered.id,
      pool_id: terms.id,
      competition_id: competition.id,
      revision: 4,
      data: delivered,
    })
    .execute();
  const cases = async () =>
    (
      await db
        .selectFrom('prize_correction_cases')
        .select('data')
        .where('proposal_id', '=', delivered.id)
        .execute()
    ).map((r) => r.data);
  await reconcilePrizeCorrections(db, competition.id);
  assert.equal((await cases()).length, 0);
  const renamed = entries.find((e) => e.data.id === recipient.entryId);
  assert.ok(renamed);
  await db
    .updateTable('entries')
    .set({
      data: { ...renamed.data, name: 'Cosmetic rename without award change' },
    })
    .where('id', '=', recipient.entryId)
    .execute();
  await reconcilePrizeCorrections(db, competition.id);
  assert.equal((await cases()).length, 0);
  assert.equal((await readPublicPrizePool(db, terms.id, null)).held, false);
  await grantProofStaff(db, preparer, [
    { role: 'prize-manager', competitionId: competition.id },
  ]);
  const eligibility = async (excluded: boolean) =>
    executePrizeCommand(
      db,
      { ...principal, accountId: preparer },
      [{ role: 'prize-manager', competitionId: competition.id }],
      {
        kind: 'eligibility',
        commandId: randomUUID(),
        competitionId: competition.id,
        poolId: terms.id,
        expectedRevision: (
          await db
            .selectFrom('prize_pools')
            .select('revision')
            .where('id', '=', terms.id)
            .executeTakeFirstOrThrow()
        ).revision,
        accountId: recipient.accountId,
        excluded,
        reason: 'Synthetic evidenced eligibility decision',
        evidenceReference: 'Synthetic eligibility evidence record',
      },
    );
  await eligibility(true);
  const results = await Promise.all([
    reconcilePrizeCorrections(db, competition.id),
    reconcilePrizeCorrections(db, competition.id),
  ]);
  assert.ok(results.every((r) => r.failed.length === 0));
  const review = (await cases())[0];
  assert.ok(review);
  assert.equal((await cases()).length, 1);
  assert.equal(review.state, 'open');
  assert.equal(
    review.observation.preview?.awards.some(
      (a) => a.accountId === recipient.accountId,
    ),
    false,
  );
  assert.equal((await readPublicPrizePool(db, terms.id, null)).held, true);
  const command: PrizeCorrectionCommand = {
    commandId: randomUUID(),
    competitionId: competition.id,
    caseId: review.id,
    expectedRevision: review.revision,
    expectedFingerprint: review.observation.fingerprint,
    decision: 'original-delivery-stands',
    reason: 'Honor completed delivery after independent evidence review',
    reference: 'Reviewed synthetic case, no funds moved',
  };
  await assert.rejects(
    executePrizeCorrection(
      db,
      principal,
      [{ role: 'prize-approver', competitionId: randomUUID() }],
      command,
    ),
    AccessDenied,
  );
  await assert.rejects(
    executePrizeCorrection(db, principal, grants, {
      ...command,
      expectedRevision: 99,
    }),
    rejected('prize-correction-changed'),
  );
  for (const accountId of [recipient.accountId, preparer])
    await db
      .insertInto('staff_grants')
      .values({
        id: randomUUID(),
        account_id: accountId,
        role: 'prize-approver',
        competition_id: competition.id,
        granted_by: preparer,
      })
      .execute();
  await assert.rejects(
    executePrizeCorrection(
      db,
      { ...principal, accountId: recipient.accountId },
      grants,
      command,
    ),
    rejected('prize-self-award'),
  );
  await assert.rejects(
    executePrizeCorrection(
      db,
      { ...principal, accountId: preparer },
      grants,
      command,
    ),
    rejected('prize-distinct-approver-required'),
  );
  const [resolved, retry] = await Promise.all([
    executePrizeCorrection(db, principal, grants, command),
    executePrizeCorrection(db, principal, grants, command),
  ]);
  assert.deepEqual(resolved, retry);
  await reconcilePrizeCorrections(db, competition.id);
  assert.equal((await cases()).length, 1);
  assert.equal((await cases())[0]?.state, 'resolved');
  assert.equal((await readPublicPrizePool(db, terms.id, null)).held, false);
  // A restoration after resolution is another decision, not an erasure of that review.
  await eligibility(false);
  await reconcilePrizeCorrections(db, competition.id);
  const reopened = (await cases()).find((c) => c.state === 'open');
  assert.ok(reopened);
  assert.notEqual(reopened.id, review.id);
  // Changed evidence between viewing and acceptance cannot resolve stale facts, even before the worker runs.
  await eligibility(true);
  const newer = {
    ...command,
    commandId: randomUUID(),
    caseId: reopened.id,
    expectedRevision: reopened.revision,
    expectedFingerprint: reopened.observation.fingerprint,
  };
  await assert.rejects(
    executePrizeCorrection(db, principal, grants, newer),
    rejected('prize-correction-changed'),
  );
  await reconcilePrizeCorrections(db, competition.id);
  const changed = (await cases()).find((c) => c.id === reopened.id);
  assert.ok(changed);
  assert.equal(changed.revision, 2);
  const observations = await db
    .selectFrom('prize_correction_observations')
    .selectAll()
    .where('case_id', '=', changed.id)
    .execute();
  assert.equal(observations.length, 2);
  await db
    .deleteFrom('staff_grants')
    .where('account_id', '=', approver)
    .execute();
  await assert.rejects(
    executePrizeCorrection(db, principal, grants, {
      ...newer,
      expectedRevision: changed.revision,
      expectedFingerprint: changed.observation.fingerprint,
    }),
    AccessDenied,
  );
  assert.deepEqual(
    (
      await db
        .selectFrom('prize_proposals')
        .select('data')
        .where('id', '=', delivered.id)
        .executeTakeFirstOrThrow()
    ).data,
    delivered,
  );
  const admin = await readPrizeAdministration(
    db,
    { ...principal, accountId: preparer },
    grants,
    terms.id,
  );
  assert.equal(admin.corrections.length, 2);
  assert.equal(admin.observationHistory.length, 3);
  await db
    .insertInto('staff_grants')
    .values({
      id: randomUUID(),
      account_id: approver,
      role: 'prize-approver',
      competition_id: competition.id,
      granted_by: preparer,
    })
    .execute();
  await db
    .updateTable('gameweeks')
    .set({ data: { ...first, status: 'review' } })
    .where('id', '=', first.id)
    .execute();
  await reconcilePrizeCorrections(db, competition.id);
  const unsettled = (await cases()).find((c) => c.state === 'open');
  assert.ok(unsettled);
  assert.equal(unsettled.observation.preview, null);
  await assert.rejects(
    executePrizeCorrection(db, principal, grants, {
      ...newer,
      expectedRevision: unsettled.revision,
      expectedFingerprint: unsettled.observation.fingerprint,
    }),
    rejected('prize-correction-unsettled'),
  );
  await db
    .updateTable('gameweeks')
    .set({ data: first })
    .where('id', '=', first.id)
    .execute();
  await reconcilePrizeCorrections(db, competition.id);
  const final = (await cases()).find((c) => c.state === 'open');
  assert.ok(final);
  await executePrizeCorrection(db, principal, grants, {
    ...newer,
    expectedRevision: final.revision,
    expectedFingerprint: final.observation.fingerprint,
    decision: 'external-remedy-recorded',
    reference: 'Synthetic completed external remedy, no real money',
  });
  assert.equal(
    (await cases()).find((c) => c.id === final.id)?.resolution?.decision,
    'external-remedy-recorded',
  );
});
