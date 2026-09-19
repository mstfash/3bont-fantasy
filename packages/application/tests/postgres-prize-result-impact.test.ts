import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  leagueGroupSchema,
  entryResultSchema,
  prizePoolSchema,
  prizeProposalSchema,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { calculatePrizePreview } from '../src/prize-preview.ts';
import { calculatePrizeResultImpact } from '../src/prize-result-impact.ts';
import { calculateRoundResultProjection } from '../src/round-result-projection.ts';
import { previewPrizeResultCorrection } from '../src/prize-result-preview.ts';
import { previewGameweekResults } from '../src/result-preview.ts';
import { executeResultCommand } from '../src/results.ts';
import { AccessDenied, type StaffGrant } from '../src/authorization.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 6 });
const db = createDatabase(pool);
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

void test('prize correction estimates share canonical allocation, protect authority and leave award records immutable', async (t) => {
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
  const round = rounds[0],
    later = rounds[1];
  assert.ok(round && later);
  const entries = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('id')
      .execute()
  ).map((r) => r.data);
  for (const e of entries)
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) ON CONFLICT(id) DO UPDATE SET "emailVerified"=true',
      [e.accountId, e.name, `${e.accountId}@prize-impact.test`],
    );
  const terms = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    revision: 1,
    name: { ar: 'جائزة المعاينة', en: 'Projection proof' },
    description: { ar: 'اختبار', en: 'Synthetic proof' },
    firstGameweekId: round.id,
    lastGameweekId: round.id,
    groupId: null,
    eligibilityCutoff: round.deadline,
    currency: 'EGP',
    places: [
      { kind: 'cash', amountMinor: 10001 },
      { kind: 'cash', amountMinor: 5000 },
    ],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: [round.id],
    publishedAt: new Date().toISOString(),
    evidenceReference: 'Synthetic terms only',
    ranking: 'shared',
  });
  await db
    .insertInto('prize_pools')
    .values({
      id: terms.id,
      competition_id: competition.id,
      group_id: null,
      revision: 1,
      data: terms,
    })
    .execute();
  const projection = await db
    .transaction()
    .execute((tx) => calculateRoundResultProjection(tx, round));
  assert.ok(projection.replacement && projection.inputs.settled);
  const canonical = await db
    .transaction()
    .execute((tx) => calculatePrizePreview(tx, terms));
  assert.deepEqual(canonical.issues, []);
  const estimate = (replacement = projection, prize = terms) =>
    db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute((tx) =>
        calculatePrizeResultImpact(tx, prize, round, replacement),
      );
  const initial = await estimate();
  const eligible = canonical.candidates
    .filter((c) => c.eligible)
    .filter(
      (e, i, all) => all.findIndex((c) => c.accountId === e.accountId) === i,
    );
  const a = eligible[0],
    b = eligible[1];
  assert.ok(a && b);
  const tied = {
    ...projection,
    replacement: new Map(
      [...projection.replacement].map(([id, score]) => [
        id,
        entryResultSchema.parse({
          ...score,
          total: id === a.entryId || id === b.entryId ? 50000 : -1000,
        }),
      ]),
    ),
  };
  const principal = {
    accountId: randomUUID(),
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const owner: StaffGrant[] = [{ role: 'owner', competitionId: null }];
  await grantProofStaff(db, principal.accountId, owner);

  await t.test(
    'unchanged projection exactly matches the strict published prize preview',
    async () => {
      assert.deepEqual(initial.holds, []);
      assert.deepEqual(initial.before, canonical);
      assert.deepEqual(initial.after, canonical);
      assert.equal((await estimate()).fingerprint, initial.fingerprint);
    },
  );
  await t.test(
    'cash ties conserve minor units and goods ties hold instead of choosing a winner',
    async () => {
      const cash = await estimate(tied);
      assert.ok(cash.after);
      assert.equal(cash.after.awards.length, 2);
      assert.ok(
        cash.after.awards.every(
          (x) => x.reward.kind === 'cash' && x.reward.amountMinor === 7500,
        ),
      );
      assert.equal(cash.after.residueMinor, 1);
      const goods = await estimate(
        tied,
        prizePoolSchema.parse({
          ...terms,
          places: [
            {
              kind: 'goods',
              name: { en: 'Shirt', ar: 'قميص' },
              cashEquivalentMinor: null,
            },
          ],
        }),
      );
      assert.equal(goods.after, null);
      assert.ok(
        goods.holds.some((x) => x.startsWith('goods-tie-needs-resolution:')),
      );
    },
  );
  await t.test(
    'unsettled facts, missing replacements and incomplete entry results never produce partial winners',
    async () => {
      for (const replacement of [
        { ...projection, replacement: null },
        { ...projection, inputs: { ...projection.inputs, settled: false } },
      ]) {
        const held = await estimate(replacement);
        assert.equal(held.after, null);
        assert.ok(held.holds.includes('correction-incomplete'));
      }
      const missing = new Map(projection.replacement);
      missing.delete(a.entryId);
      const held = await estimate({ ...projection, replacement: missing });
      assert.equal(held.after, null);
      assert.ok(held.holds.includes('incomplete-entry-results'));
    },
  );
  await t.test(
    'another unfinished round in the prize window holds projection and keeps strict preparation blocked',
    async () => {
      const wider = prizePoolSchema.parse({
        ...terms,
        lastGameweekId: later.id,
        gameweekIds: [round.id, later.id],
      });
      await db
        .updateTable('gameweeks')
        .set({ data: { ...later, status: 'provisional' } })
        .where('id', '=', later.id)
        .execute();
      try {
        const held = await estimate(projection, wider);
        assert.equal(held.after, null);
        assert.ok(held.holds.includes('prize-results-not-final'));
        await assert.rejects(
          db.transaction().execute((tx) => calculatePrizePreview(tx, wider)),
          { code: 'prize-results-not-final' },
        );
      } finally {
        await db
          .updateTable('gameweeks')
          .set({ data: later })
          .where('id', '=', later.id)
          .execute();
      }
    },
  );
  await t.test(
    'financial scope is separate from competition management, including the prize-only read path',
    async () => {
      const manager: StaffGrant[] = [
        { role: 'competition-manager', competitionId: competition.id },
      ];
      const hidden = await previewGameweekResults(
        db,
        principal,
        manager,
        round.id,
      );
      assert.equal(hidden.prizeImpacts, null);
      const full = await previewGameweekResults(db, principal, owner, round.id);
      assert.ok(full.prizeImpacts?.some((p) => p.pool.id === terms.id));
      for (const role of ['prize-manager', 'prize-approver'] as const) {
        const allowed = await previewPrizeResultCorrection(
          db,
          principal,
          [{ role, competitionId: competition.id }],
          terms.id,
          round.id,
        );
        assert.deepEqual(allowed.impact, initial);
        await assert.rejects(
          previewPrizeResultCorrection(
            db,
            principal,
            [{ role, competitionId: randomUUID() }],
            terms.id,
            round.id,
          ),
          AccessDenied,
        );
      }
      await assert.rejects(
        previewPrizeResultCorrection(
          db,
          principal,
          manager,
          terms.id,
          round.id,
        ),
        AccessDenied,
      );
      await assert.rejects(
        previewPrizeResultCorrection(
          db,
          { ...principal, mfaVerifiedAt: null },
          owner,
          terms.id,
          round.id,
        ),
        AccessDenied,
      );
      await assert.rejects(
        previewPrizeResultCorrection(db, principal, owner, terms.id, later.id),
        { code: 'prize-correction-outside-window' },
      );
    },
  );
  await t.test(
    'changed account eligibility invalidates confirmation without changing football facts or the pool revision',
    async () => {
      const viewed = await previewGameweekResults(
        db,
        principal,
        owner,
        round.id,
      );
      const account = await db
        .selectFrom('accounts')
        .select('suspended_until')
        .where('id', '=', a.accountId)
        .executeTakeFirstOrThrow();
      await db
        .updateTable('accounts')
        .set({ suspended_until: new Date(Date.now() + 86400_000) })
        .where('id', '=', a.accountId)
        .execute();
      try {
        const changed = await estimate();
        assert.notEqual(changed.fingerprint, initial.fingerprint);
        assert.ok(
          changed.after?.candidates
            .find((c) => c.entryId === a.entryId)
            ?.reasons.includes('account-suspended'),
        );
        await assert.rejects(
          executeResultCommand(db, principal, owner, {
            kind: 'reopen',
            commandId: randomUUID(),
            gameweekId: round.id,
            expectedResultRevision: round.resultRevision,
            expectedFingerprint: viewed.fingerprint,
            reason: 'Synthetic stale eligibility confirmation',
          }),
          { code: 'preview-changed' },
        );
        assert.deepEqual(
          (
            await db
              .selectFrom('gameweeks')
              .select('data')
              .where('id', '=', round.id)
              .executeTakeFirstOrThrow()
          ).data,
          round,
        );
      } finally {
        await db
          .updateTable('accounts')
          .set(account)
          .where('id', '=', a.accountId)
          .execute();
      }
    },
  );
  await t.test(
    'recorded delivery remains immutable and viewing creates no commands, audits or correction cases',
    async () => {
      const delivered = prizeProposalSchema.parse({
        id: randomUUID(),
        poolId: terms.id,
        competitionId: competition.id,
        revision: 4,
        preview: canonical,
        state: 'fulfilled',
        preparedBy: principal.accountId,
        preparedAt: new Date().toISOString(),
        reviewedBy: principal.accountId,
        reviewedAt: new Date().toISOString(),
        approvedBy: randomUUID(),
        approvedAt: new Date().toISOString(),
        fulfilledBy: principal.accountId,
        fulfilledAt: new Date().toISOString(),
        fulfillmentReference: 'Synthetic delivery receipt',
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
      const counts = async () =>
        Promise.all([
          db
            .selectFrom('commands')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .executeTakeFirstOrThrow(),
          db
            .selectFrom('audit_events')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .executeTakeFirstOrThrow(),
          db
            .selectFrom('prize_correction_cases')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .executeTakeFirstOrThrow(),
        ]);
      const before = await counts();
      const observed = await estimate(tied);
      assert.deepEqual(observed.recorded, [
        {
          id: delivered.id,
          revision: 4,
          state: 'fulfilled',
          preview: canonical,
        },
      ]);
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
      assert.deepEqual(await counts(), before);
      await db
        .deleteFrom('prize_proposals')
        .where('id', '=', delivered.id)
        .execute();
    },
  );
  await t.test(
    'prize membership uses the cutoff history, not current membership',
    async () => {
      const group = leagueGroupSchema.parse({
        id: randomUUID(),
        competitionId: competition.id,
        organizerId: a.accountId,
        name: 'Prize cutoff proof',
        description: 'Synthetic',
        visibility: 'private',
        approvalRequired: false,
        entryLimit: 3,
        startGameweekId: null,
        revision: 1,
        createdAt: new Date().toISOString(),
      });
      await db
        .insertInto('league_groups')
        .values({
          id: group.id,
          competition_id: competition.id,
          organizer_id: a.accountId,
          invitation_hash: 'd'.repeat(64),
          revision: 1,
          data: group,
        })
        .execute();
      await db
        .insertInto('group_memberships')
        .values(
          [a, b].map((e) => ({
            group_id: group.id,
            competition_id: competition.id,
            entry_id: e.entryId,
            account_id: e.accountId,
            status:
              e.entryId === a.entryId ? ('left' as const) : ('active' as const),
          })),
        )
        .execute();
      await db
        .insertInto('group_membership_history')
        .values([
          {
            group_id: group.id,
            entry_id: a.entryId,
            status: 'active',
            occurred_at: new Date(Date.parse(terms.eligibilityCutoff) - 1000),
          },
          {
            group_id: group.id,
            entry_id: a.entryId,
            status: 'left',
            occurred_at: new Date(Date.parse(terms.eligibilityCutoff) + 1000),
          },
          {
            group_id: group.id,
            entry_id: b.entryId,
            status: 'active',
            occurred_at: new Date(Date.parse(terms.eligibilityCutoff) + 1000),
          },
        ])
        .execute();
      try {
        const restricted = await estimate(projection, {
          ...terms,
          groupId: group.id,
        });
        assert.deepEqual(
          restricted.after?.candidates.map((c) => c.entryId),
          [a.entryId],
        );
        assert.deepEqual(
          restricted.before?.candidates.map((c) => c.entryId),
          [a.entryId],
        );
        assert.equal(restricted.after.awards[0]?.accountId, a.accountId);
      } finally {
        await db
          .deleteFrom('group_membership_history')
          .where('group_id', '=', group.id)
          .execute();
        await db
          .deleteFrom('group_memberships')
          .where('group_id', '=', group.id)
          .execute();
        await db
          .deleteFrom('league_groups')
          .where('id', '=', group.id)
          .execute();
      }
    },
  );
  await t.test(
    'another reviewed or stale round cannot be silently included in a corrected award',
    async () => {
      const wider = {
        ...terms,
        lastGameweekId: later.id,
        gameweekIds: [round.id, later.id],
      };
      const reviewId = randomUUID();
      await db
        .insertInto('result_reviews')
        .values({
          id: reviewId,
          gameweek_id: later.id,
          reason: 'Synthetic review',
          status: 'open',
          evidence_id: null,
          resolved_at: null,
          resolved_by: null,
        })
        .execute();
      try {
        const held = await estimate(projection, wider);
        assert.equal(held.after, null);
        assert.ok(held.holds.includes('prize-results-under-review'));
      } finally {
        await db
          .deleteFrom('result_reviews')
          .where('id', '=', reviewId)
          .execute();
      }
      const calculation = await db
        .selectFrom('round_calculations')
        .select('payload')
        .where('gameweek_id', '=', later.id)
        .where('revision', '=', later.resultRevision)
        .executeTakeFirstOrThrow();
      await db
        .updateTable('round_calculations')
        .set({
          fingerprint: '0'.repeat(64),
          payload: { ...calculation.payload, fingerprint: '0'.repeat(64) },
        })
        .where('gameweek_id', '=', later.id)
        .where('revision', '=', later.resultRevision)
        .execute();
      try {
        const held = await estimate(projection, wider);
        assert.equal(held.after, null);
        assert.ok(held.holds.includes('prize-facts-changed'));
      } finally {
        await db
          .updateTable('round_calculations')
          .set({
            fingerprint: calculation.payload.fingerprint,
            payload: calculation.payload,
          })
          .where('gameweek_id', '=', later.id)
          .where('revision', '=', later.resultRevision)
          .execute();
      }
    },
  );
  await db.deleteFrom('prize_pools').where('id', '=', terms.id).execute();
});
