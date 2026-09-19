import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  historicalRuleSelectionSchema,
  historicalRuleSettingsSchema,
  historicalRuleCommandSchema,
  entryResultSchema,
  lockedEntrySchema,
  prizePoolSchema,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import {
  previewHistoricalRules,
  executeHistoricalRules,
  readHistoricalRulesHistory,
} from '../src/historical-rules.ts';
import { publishGameweekResults } from '../src/results.ts';
import { calculatePrizePreview } from '../src/prize-preview.ts';
import { calculateRoundInputs } from '../src/round-inputs.ts';
import { calculateEntryResult } from '../src/entry-calculation.ts';
import { AccessDenied } from '../src/authorization.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
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
void test('historical rules replay is scoped, atomic, versioned and preserves accepted decisions', async (t) => {
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
    .selectAll()
    .where('competition_id', '=', competition.id)
    .orderBy('number')
    .execute();
  const row = rounds.find((r) => r.data.status === 'finalized');
  assert.ok(row);
  const round = row.data;
  const principal = {
    accountId: randomUUID(),
    sessionId: randomUUID(),
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  };
  await grantProofStaff(db, principal.accountId, [
    { role: 'owner', competitionId: null },
  ]);
  const entries = await db
    .selectFrom('entries')
    .selectAll()
    .where('competition_id', '=', competition.id)
    .orderBy('id')
    .execute();
  const snapshots = await db
    .selectFrom('entry_snapshots')
    .selectAll()
    .where('gameweek_id', '=', round.id)
    .orderBy('entry_id')
    .execute();
  for (const entry of entries)
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) ON CONFLICT(id) DO UPDATE SET "emailVerified"=true',
      [
        entry.data.accountId,
        entry.data.name,
        `${entry.data.accountId}@historical.test`,
      ],
    );
  const terms = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    revision: 1,
    name: { en: 'Historical replay proof', ar: 'اختبار التصحيح' },
    description: { en: 'Synthetic only', ar: 'تجريبي' },
    firstGameweekId: round.id,
    lastGameweekId: round.id,
    groupId: null,
    eligibilityCutoff: round.deadline,
    currency: 'EGP',
    places: [{ kind: 'cash', amountMinor: 10001 }],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: [round.id],
    publishedAt: new Date().toISOString(),
    evidenceReference: 'Synthetic terms',
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
  const selection = historicalRuleSelectionSchema.parse({
    gameweekId: round.id,
    expectedResultRevision: round.resultRevision,
    settings: {
      scoring: historicalRuleSettingsSchema.shape.scoring
        .strip()
        .parse(round.rules.scoring),
      gameweek: { ...round.rules.gameweek, captainMultiplier: 3 },
    },
  });
  // Strict settings reject all non-scoring economic or structural keys.
  const proposal = () => previewHistoricalRules(db, principal, selection);
  const receipt = (fingerprint: string) =>
    historicalRuleCommandSchema.parse({
      kind: 'replay-rules',
      commandId: randomUUID(),
      selection,
      expectedFingerprint: fingerprint,
      reason: 'Synthetic correction supported by the published terms',
    });
  const originalCalculations = await db
    .selectFrom('round_calculations')
    .selectAll()
    .where('gameweek_id', '=', round.id)
    .orderBy('revision')
    .execute();
  async function roundNow() {
    return (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', round.id)
        .executeTakeFirstOrThrow()
    ).data;
  }
  async function counts() {
    return (
      await pool.query<{
        commands: number;
        audit: number;
        results: number;
        calculations: number;
      }>(
        `SELECT (SELECT count(*)::int FROM fantasy.commands WHERE actor_id=$1) AS commands,(SELECT count(*)::int FROM fantasy.audit_events WHERE actor_id=$1) AS audit,(SELECT count(*)::int FROM fantasy.entry_results WHERE gameweek_id=$2) AS results,(SELECT count(*)::int FROM fantasy.round_calculations WHERE gameweek_id=$2) AS calculations`,
        [principal.accountId, round.id],
      )
    ).rows[0];
  }
  try {
    await t.test(
      'preview is repeatable and writes nothing; every forbidden field is rejected',
      async () => {
        const before = await counts(),
          a = await proposal(),
          b = await proposal();
        assert.equal(a.fingerprint, b.fingerprint);
        assert.equal(a.canApply, true);
        assert.deepEqual(await counts(), before);
        assert.deepEqual(await roundNow(), round);
        assert.deepEqual(a.originalRules, round.rules);
        assert.equal(
          a.proposedRules.version,
          Math.max(
            competition.rules.version,
            ...rounds.map((r) => r.data.rules.version),
          ) + 1,
        );
        assert.ok(a.impact.prizeImpacts?.length === 1);
        assert.ok(a.impact.rankings);
        await assert.rejects(
          previewHistoricalRules(db, principal, {
            ...selection,
            settings: {
              scoring: historicalRuleSettingsSchema.shape.scoring
                .strip()
                .parse(round.rules.scoring),
              gameweek: round.rules.gameweek,
            },
          }),
          { code: 'replay-no-change' },
        );
        for (const key of [
          'transfer',
          'squad',
          'enabledChips',
          'ranking',
          'pricing',
          'version',
        ])
          assert.equal(
            historicalRuleSelectionSchema.safeParse({
              ...selection,
              settings: { ...selection.settings, [key]: {} },
            }).success,
            false,
          );
      },
    );
    await t.test(
      'only current owner authority with fresh verification may preview, read history or apply',
      async () => {
        const manager = { ...principal, accountId: randomUUID() };
        await grantProofStaff(db, manager.accountId, [
          { role: 'competition-manager', competitionId: competition.id },
        ]);
        const preview = await proposal();
        await assert.rejects(
          previewHistoricalRules(db, manager, selection),
          AccessDenied,
        );
        await assert.rejects(
          readHistoricalRulesHistory(db, manager, round.id),
          AccessDenied,
        );
        await assert.rejects(
          executeHistoricalRules(db, manager, receipt(preview.fingerprint)),
          AccessDenied,
        );
        await assert.rejects(
          previewHistoricalRules(
            db,
            { ...principal, authenticatedAt: new Date(Date.now() - 3600000) },
            selection,
          ),
          AccessDenied,
        );
      },
    );
    await t.test(
      'an altered immutable snapshot invalidates confirmation even when its points do not change',
      async () => {
        const preview = await proposal(),
          snapshot = snapshots[0];
        assert.ok(snapshot);
        // The bank is not a scoring input, but it is part of the recorded decision evidence.
        await pool.query(
          "UPDATE fantasy.entry_snapshots SET payload=jsonb_set(payload,'{roster,bank}',to_jsonb(((payload#>>'{roster,bank}')::integer+1))) WHERE entry_id=$1 AND gameweek_id=$2",
          [snapshot.entry_id, round.id],
        );
        try {
          await assert.rejects(
            executeHistoricalRules(db, principal, receipt(preview.fingerprint)),
            { code: 'preview-changed' },
          );
          assert.deepEqual(await roundNow(), round);
        } finally {
          await db
            .updateTable('entry_snapshots')
            .set({ payload: snapshot.payload })
            .where('entry_id', '=', snapshot.entry_id)
            .where('gameweek_id', '=', round.id)
            .execute();
        }
      },
    );
    await t.test(
      'publication failure rolls back new rules, results, reviews, receipts and audit together',
      async () => {
        const reviewId = randomUUID();
        await db
          .insertInto('result_reviews')
          .values({
            id: reviewId,
            gameweek_id: round.id,
            reason: 'Synthetic historical review',
            status: 'open',
            evidence_id: null,
            resolved_at: null,
            resolved_by: null,
          })
          .execute();
        const preview = await proposal(),
          before = await counts();
        await pool.query(
          `CREATE FUNCTION fantasy.reject_historical_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic publication failure'; END $$; CREATE TRIGGER reject_historical_proof BEFORE INSERT ON fantasy.round_calculations FOR EACH ROW EXECUTE FUNCTION fantasy.reject_historical_proof()`,
        );
        try {
          await assert.rejects(
            executeHistoricalRules(db, principal, receipt(preview.fingerprint)),
            /synthetic publication failure/,
          );
          assert.deepEqual(await counts(), before);
          assert.deepEqual(await roundNow(), round);
          assert.equal(
            (
              await db
                .selectFrom('result_reviews')
                .select('status')
                .where('id', '=', reviewId)
                .executeTakeFirstOrThrow()
            ).status,
            'open',
          );
        } finally {
          await db
            .deleteFrom('result_reviews')
            .where('id', '=', reviewId)
            .execute();
          await pool.query(
            'DROP TRIGGER reject_historical_proof ON fantasy.round_calculations; DROP FUNCTION fantasy.reject_historical_proof()',
          );
        }
      },
    );
    await t.test(
      'incomplete scoring inputs can be reviewed but cannot publish a historical replacement',
      async () => {
        const fixture = (
          await db
            .selectFrom('fixture_assignments')
            .innerJoin(
              'fixtures',
              'fixtures.id',
              'fixture_assignments.fixture_id',
            )
            .select('fixtures.data')
            .where('fixture_assignments.gameweek_id', '=', round.id)
            .executeTakeFirstOrThrow()
        ).data;
        const previousPreview = await proposal();
        await db
          .updateTable('fixtures')
          .set({ data: { ...fixture, factsComplete: false } })
          .where('id', '=', fixture.id)
          .execute();
        try {
          await assert.rejects(
            executeHistoricalRules(
              db,
              principal,
              receipt(previousPreview.fingerprint),
            ),
            { code: 'preview-changed' },
          );
          const blocked = await proposal();
          assert.equal(blocked.canApply, false);
          await assert.rejects(
            executeHistoricalRules(db, principal, receipt(blocked.fingerprint)),
            { code: 'replay-incomplete' },
          );
          assert.deepEqual(await roundNow(), round);
        } finally {
          await db
            .updateTable('fixtures')
            .set({ data: fixture })
            .where('id', '=', fixture.id)
            .execute();
        }
      },
    );
    await t.test(
      'concurrent confirmation creates one coherent revision; publication matches its complete preview',
      async () => {
        const preview = await proposal(),
          command = receipt(preview.fingerprint);
        const [a, b] = await Promise.all([
          executeHistoricalRules(db, principal, command),
          executeHistoricalRules(db, principal, command),
        ]);
        assert.deepEqual(a, b);
        assert.equal(a.resultRevision, round.resultRevision + 1);
        assert.equal(a.rules.version, preview.proposedRules.version);
        const results = await db
          .selectFrom('entry_results')
          .selectAll()
          .where('gameweek_id', '=', round.id)
          .where('revision', '=', a.resultRevision)
          .execute();
        assert.equal(results.length, snapshots.length);
        for (const change of preview.impact.changes)
          assert.equal(
            results.find((r) => r.entry_id === change.entryId)?.points,
            change.after,
          );
        const inputs = await calculateRoundInputs(db, a);
        const players = new Map(inputs.players.map((p) => [p.footballerId, p]));
        for (const snapshot of snapshots) {
          const result = calculateEntryResult(
            lockedEntrySchema.parse(snapshot.payload),
            a,
            players,
            inputs.settled,
          );
          assert.equal(result.status, 'scored');
          assert.deepEqual(
            entryResultSchema.parse(
              results.find((r) => r.entry_id === snapshot.entry_id)?.payload,
            ),
            result.payload,
          );
        }
        assert.deepEqual(
          await db
            .selectFrom('entries')
            .selectAll()
            .where('competition_id', '=', competition.id)
            .orderBy('id')
            .execute(),
          entries,
        );
        assert.deepEqual(
          await db
            .selectFrom('entry_snapshots')
            .selectAll()
            .where('gameweek_id', '=', round.id)
            .orderBy('entry_id')
            .execute(),
          snapshots,
        );
        assert.deepEqual(
          (
            await db
              .selectFrom('competitions')
              .select('data')
              .where('id', '=', competition.id)
              .executeTakeFirstOrThrow()
          ).data,
          competition,
        );
        assert.deepEqual(
          await db
            .selectFrom('gameweeks')
            .selectAll()
            .where('competition_id', '=', competition.id)
            .where('id', '!=', round.id)
            .orderBy('number')
            .execute(),
          rounds.filter((r) => r.id !== round.id),
        );
        const after = await db
          .transaction()
          .execute((tx) => calculatePrizePreview(tx, terms));
        assert.deepEqual(
          after.awards,
          preview.impact.prizeImpacts?.[0]?.after?.awards,
        );
        const history = await readHistoricalRulesHistory(
          db,
          principal,
          round.id,
        );
        assert.equal(history[0]?.revision, a.resultRevision);
        assert.deepEqual(
          history.find((h) => h.revision === round.resultRevision)?.rules,
          originalCalculations.find((c) => c.revision === round.resultRevision)
            ?.payload.rules,
        );
        assert.equal(
          (await publishGameweekResults(db, round.id)).revision,
          a.resultRevision,
        );
        await assert.rejects(
          executeHistoricalRules(db, principal, {
            ...command,
            reason: 'Different retry content',
          }),
          { code: 'idempotency-conflict' },
        );
        await db
          .deleteFrom('staff_grants')
          .where('account_id', '=', principal.accountId)
          .execute();
        await assert.rejects(
          executeHistoricalRules(db, principal, command),
          AccessDenied,
        );
      },
    );
    await t.test(
      'replaying a finalized round restarts its correction window and holds award approval',
      async () => {
        await grantProofStaff(db, principal.accountId, [
          { role: 'owner', competitionId: null },
        ]);
        const current = await roundNow();
        // Synthetic fixture switches from the zero-hour rehearsal to the live template's interval.
        await db
          .updateTable('gameweeks')
          .set({
            data: {
              ...current,
              rules: { ...current.rules, correctionWindowHours: 24 },
            },
          })
          .where('id', '=', round.id)
          .execute();
        const selected = historicalRuleSelectionSchema.parse({
          ...selection,
          expectedResultRevision: current.resultRevision,
          settings: {
            ...selection.settings,
            gameweek: { ...selection.settings.gameweek, captainMultiplier: 4 },
          },
        });
        const preview = await previewHistoricalRules(db, principal, selected);
        const started = Date.now();
        const corrected = await executeHistoricalRules(db, principal, {
          ...receipt(preview.fingerprint),
          selection: selected,
        });
        assert.equal(corrected.status, 'provisional');
        assert.equal(corrected.finalizedAt, null);
        assert.ok(
          corrected.lastMaterialChangeAt &&
            Date.parse(corrected.lastMaterialChangeAt) >= started,
        );
        assert.equal(
          (await publishGameweekResults(db, round.id)).status,
          'provisional',
        );
        await assert.rejects(
          db.transaction().execute((tx) => calculatePrizePreview(tx, terms)),
          { code: 'prize-results-not-final' },
        );
      },
    );
  } finally {
    await db
      .deleteFrom('entry_results')
      .where('gameweek_id', '=', round.id)
      .where('revision', '>', round.resultRevision)
      .execute();
    await db
      .deleteFrom('round_calculations')
      .where('gameweek_id', '=', round.id)
      .where('revision', '>', round.resultRevision)
      .execute();
    await db
      .updateTable('gameweeks')
      .set({ data: round })
      .where('id', '=', round.id)
      .execute();
    await db.deleteFrom('prize_pools').where('id', '=', terms.id).execute();
  }
});
