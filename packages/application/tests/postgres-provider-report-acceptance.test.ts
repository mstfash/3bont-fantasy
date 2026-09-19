import { requiredFixtureValue } from './required-fixture-value.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { sql } from 'kysely';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  providerAcceptanceCommandSchema,
  factChangeSchema,
} from '@fantasy/contracts';
import { acceptanceFixture } from './provider-acceptance-fixture.ts';
import { acceptanceRounds } from './provider-acceptance-rounds.ts';
import { publishGameweekResults } from '../src/results.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import { acceptNextProviderReport } from '../src/provider-acceptance.ts';
import { executeProviderAcceptancePolicy } from '../src/provider-acceptance-policy.ts';
import { executeMatchDataCommand } from '../src/match-data.ts';
import { readSavedProviderReview } from '../src/provider-normalization.ts';
import { readProviderAcceptance } from '../src/provider-acceptance-query.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 8 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const reject = (code: string) => (e: unknown) =>
  e instanceof CommandRejected && e.code === code;
void test('a paused newer schedule cannot starve another season and policy revisions retain prior decisions', async () => {
  const active = await acceptanceFixture(db, 990041);
  const paused = await acceptanceFixture(db, 990042);
  try {
    await executeProviderAcceptancePolicy(
      db,
      active.principal,
      active.policyCommand(),
    );
    await executeProviderAcceptancePolicy(
      db,
      paused.principal,
      paused.policyCommand(),
    );
    const batch = await active.batch();
    await paused.batch();
    await db
      .updateTable('provider_schedules')
      .set({ data: { ...paused.schedule, enabled: false } })
      .where('id', '=', paused.schedule.id)
      .execute();
    const accepted = await acceptNextProviderReport(db);
    assert.equal(accepted?.batchId, batch.id);
    assert.equal(accepted.state, 'accepted');
    await executeProviderAcceptancePolicy(
      db,
      active.principal,
      active.policyCommand(1),
    );
    const held = await acceptNextProviderReport(db);
    assert.equal(held?.batchId, batch.id);
    assert.equal(held.policy.revision, 2);
    assert.deepEqual(held.issues, ['acceptance-source-superseded']);
    const decisions = await db
      .selectFrom('provider_acceptances')
      .select('data')
      .where('batch_id', '=', batch.id)
      .orderBy('policy_revision')
      .execute();
    assert.deepEqual(
      decisions.map((d) => d.data.state),
      ['accepted', 'held'],
    );
  } finally {
    await paused.restore();
    await active.restore();
  }
});
void test('governed automatic report acceptance uses cached evidence and fails closed', async (t) => {
  const f = await acceptanceFixture(db);
  const rounds = await acceptanceRounds(db, f);
  try {
    const first = await f.batch();
    await t.test(
      'default disabled, explicit coverage confirmation, owner-only and current authorization on retries',
      async () => {
        assert.equal(await acceptNextProviderReport(db), null);
        const command = f.policyCommand();
        assert.equal(
          providerAcceptanceCommandSchema.safeParse({
            ...command,
            completeEligibilityConfirmed: false,
          }).success,
          false,
        );
        assert.equal(
          providerAcceptanceCommandSchema.safeParse({
            ...command,
            adapterVersion: 'api-football-reviewed-v1',
          }).success,
          false,
        );
        const steward = {
          ...f.principal,
          accountId: `acceptance-steward-${randomUUID()}`,
        };
        await grantProofStaff(db, steward.accountId, [
          { role: 'data-steward', competitionId: null },
        ]);
        await assert.rejects(
          executeProviderAcceptancePolicy(db, steward, command),
          AccessDenied,
        );
        const results = await Promise.all([
          executeProviderAcceptancePolicy(db, f.principal, command),
          executeProviderAcceptancePolicy(db, f.principal, command),
        ]);
        assert.deepEqual(results[0], results[1]);
        assert.equal(requiredFixtureValue(results[0]).revision, 1);
        await assert.rejects(
          executeProviderAcceptancePolicy(db, f.principal, {
            ...command,
            reason: 'Changed retry content',
          }),
          reject('idempotency-conflict'),
        );
        await assert.rejects(
          executeProviderAcceptancePolicy(db, f.principal, f.policyCommand()),
          reject('provider-acceptance-changed'),
        );
        await db
          .deleteFrom('staff_grants')
          .where('account_id', '=', f.principal.accountId)
          .execute();
        await assert.rejects(
          executeProviderAcceptancePolicy(db, f.principal, command),
          AccessDenied,
        );
        await grantProofStaff(db, f.principal.accountId, f.grants);
        assert.ok(
          (await readProviderAcceptance(db, f.principal)).policies.length,
        );
      },
    );
    await t.test(
      'account and schedule pauses prevent processing without recording a decision',
      async () => {
        await db
          .updateTable('provider_accounts')
          .set({ data: { ...f.account, state: 'paused' } })
          .where('id', '=', f.account.id)
          .execute();
        assert.equal(await acceptNextProviderReport(db), null);
        await db
          .updateTable('provider_accounts')
          .set({ data: f.account })
          .where('id', '=', f.account.id)
          .execute();
        await db
          .updateTable('provider_schedules')
          .set({ data: { ...f.schedule, enabled: false } })
          .where('id', '=', f.schedule.id)
          .execute();
        assert.equal(await acceptNextProviderReport(db), null);
        assert.equal(
          (
            await db
              .selectFrom('provider_acceptances')
              .selectAll()
              .where('batch_id', '=', first.id)
              .execute()
          ).length,
          0,
        );
        await db
          .updateTable('provider_schedules')
          .set({ data: f.schedule })
          .where('id', '=', f.schedule.id)
          .execute();
      },
    );
    await t.test(
      'complete FT report is accepted once across concurrent workers with retained source and mapping evidence',
      async () => {
        const results = await Promise.all([
          acceptNextProviderReport(db),
          acceptNextProviderReport(db),
          acceptNextProviderReport(db),
        ]);
        const accepted = results.filter((r) => r !== null);
        assert.equal(accepted.length, 1);
        assert.equal(
          requiredFixtureValue(accepted[0]).state,
          'accepted',
          JSON.stringify(accepted),
        );
        assert.equal(requiredFixtureValue(accepted[0]).fixtureRevision, 2);
        assert.equal(requiredFixtureValue(accepted[0]).batchId, first.id);
        const fixture = await db
          .selectFrom('fixtures')
          .select('data')
          .where('id', '=', f.fixture.id)
          .executeTakeFirstOrThrow();
        assert.partialDeepStrictEqual(fixture.data, {
          factsComplete: true,
          status: 'finished',
          homeGoals: 3,
          awayGoals: 0,
        });
        const evidence = await db
          .selectFrom('provider_evidence')
          .select('payload')
          .where(
            'id',
            '=',
            requiredFixtureValue(
              requiredFixtureValue(accepted[0]).reportEvidenceId,
            ),
          )
          .executeTakeFirstOrThrow();
        assert.partialDeepStrictEqual(evidence.payload, {
          kind: 'automatic-provider-report',
          policy: { revision: 1 },
          observation: { eligibilityComplete: true },
        });
        const review = await readSavedProviderReview(
          db,
          f.principal,
          f.grants,
          f.fixture.id,
        );
        assert.equal(review?.sources.length, 4);
        assert.equal(
          (
            await db
              .selectFrom('fact_revisions')
              .select('id')
              .where('fixture_id', '=', f.fixture.id)
              .execute()
          ).length,
          24,
        );
        await assert.rejects(
          db
            .deleteFrom('provider_attempts')
            .where('id', '=', requiredFixtureValue(first.attemptIds[0]))
            .execute(),
          (e: unknown) =>
            e instanceof Error && 'code' in e && e.code === '23503',
        );
        assert.equal(await acceptNextProviderReport(db), null);
      },
    );
    await t.test(
      'a fresh identical report preserves fixture revision and correction clock; overrides persist',
      async () => {
        const id = requiredFixtureValue(f.identities.get(8001));
        const facts = await db
          .selectFrom('fact_revisions')
          .select('payload')
          .where('fixture_id', '=', f.fixture.id)
          .where('footballer_id', '=', id)
          .executeTakeFirstOrThrow();
        const performance = factChangeSchema.parse(facts.payload);
        assert.equal(performance.kind, 'performance');
        await executeMatchDataCommand(db, f.principal, f.grants, {
          kind: 'override',
          commandId: randomUUID(),
          fixtureId: f.fixture.id,
          footballerId: id,
          expectedRevision: 1,
          reason: 'Reviewed synthetic assist correction',
          change: {
            ...performance,
            statistics: { ...performance.statistics, assists: 1 },
          },
        });
        await f.batch();
        const accepted = await acceptNextProviderReport(db);
        assert.equal(accepted?.state, 'accepted', JSON.stringify(accepted));
        assert.equal(accepted.fixtureRevision, 3);
        await assert.rejects(
          db
            .deleteFrom('provider_evidence')
            .where('id', '=', requiredFixtureValue(accepted.reportEvidenceId))
            .execute(),
          (e: unknown) =>
            e instanceof Error && 'code' in e && e.code === '23503',
        );
        assert.equal(
          (
            await db
              .selectFrom('fixture_observations')
              .selectAll()
              .where('fixture_id', '=', f.fixture.id)
              .execute()
          ).length,
          1,
        );
        assert.equal(
          (
            await db
              .selectFrom('fact_revisions')
              .selectAll()
              .where('fixture_id', '=', f.fixture.id)
              .where('is_override', '=', true)
              .execute()
          ).length,
          1,
        );
      },
    );
    await t.test(
      'older, expired, incoherent and future sources are held without replacing known facts',
      async () => {
        for (const [age, spread, code] of [
          [1, 0, 'acceptance-source-superseded'],
          [121, 0, 'acceptance-source-expired'],
          [0, 11, 'normalization-source-window'],
          [-1, 0, 'acceptance-source-expired'],
        ] as const) {
          await f.batch(f.sources, age, spread);
          const held = await acceptNextProviderReport(db);
          assert.equal(held?.state, 'held');
          assert.deepEqual(held.issues, [code]);
        }
        assert.equal(
          (
            await db
              .selectFrom('fixtures')
              .select('data')
              .where('id', '=', f.fixture.id)
              .executeTakeFirstOrThrow()
          ).data.revision,
          3,
        );
      },
    );
    await t.test(
      'unknown bench statistics and live or ambiguous match reports remain review cases',
      async () => {
        const unknown = structuredClone(f.sources);
        requiredFixtureValue(unknown.players.payload.response[0]).players =
          requiredFixtureValue(
            unknown.players.payload.response[0],
          ).players.filter((p) => p.player.id !== 8002);
        await f.batch(unknown);
        const held = await acceptNextProviderReport(db);
        assert.equal(held?.state, 'held');
        assert.ok(
          held.issues.some((i) => i.includes('minutes')),
          JSON.stringify(held.issues),
        );
        const live = structuredClone(f.sources);
        requiredFixtureValue(
          live.fixtures.payload.response[0],
        ).fixture.status.short = '2H';
        await f.batch(live);
        assert.equal((await acceptNextProviderReport(db))?.state, 'held');
        const ambiguous = structuredClone(f.sources);
        ambiguous.events.payload.response.push({
          team: { id: 7001 },
          player: { id: 8001 },
          time: { elapsed: 80, extra: null },
          type: 'Var',
          detail: 'Goal cancelled',
        });
        ambiguous.events.payload.results =
          ambiguous.events.payload.response.length;
        await f.batch(ambiguous);
        const review = await acceptNextProviderReport(db);
        assert.equal(review?.state, 'held');
        assert.ok(review.issues.includes('timeline-event-ambiguous'));
      },
    );
    await t.test(
      'retired fixture mappings and changed collection settings cannot be automatically accepted',
      async () => {
        const mapping = requiredFixtureValue(
          f.mappings.find((m) => m.kind === 'fixture'),
        );
        await f.batch();
        await db
          .updateTable('provider_identities')
          .set({ data: { ...mapping, state: 'retired' } })
          .where('id', '=', mapping.id)
          .execute();
        assert.deepEqual((await acceptNextProviderReport(db))?.issues, [
          'acceptance-mapping-changed',
        ]);
        await db
          .updateTable('provider_identities')
          .set({ data: mapping })
          .where('id', '=', mapping.id)
          .execute();
        await f.batch();
        await db
          .updateTable('provider_schedules')
          .set({ revision: 2, data: { ...f.schedule, revision: 2 } })
          .where('id', '=', f.schedule.id)
          .execute();
        assert.deepEqual((await acceptNextProviderReport(db))?.issues, [
          'acceptance-schedule-changed',
        ]);
        await db
          .updateTable('provider_schedules')
          .set({ revision: 1, data: f.schedule })
          .where('id', '=', f.schedule.id)
          .execute();
      },
    );
    await t.test(
      'a failed acceptance write rolls back evidence, facts, fixture and decision together',
      async () => {
        for (const { round } of rounds) {
          const published = await publishGameweekResults(db, round.id);
          assert.equal(
            published.status,
            'finalized',
            JSON.stringify(published),
          );
        }
        const scoresBefore = await db
          .selectFrom('entry_results')
          .selectAll()
          .where(
            'entry_id',
            'in',
            rounds.map((r) => r.entry.id),
          )
          .orderBy('entry_id')
          .execute();
        const corrected = structuredClone(f.sources);
        requiredFixtureValue(
          corrected.fixtures.payload.response[0],
        ).goals.away = 1;
        requiredFixtureValue(
          requiredFixtureValue(
            requiredFixtureValue(
              corrected.players.payload.response[1],
            ).players.find((p) => p.player.id === 8003),
          ).statistics[0],
        ).goals.total = 1;
        corrected.events.payload.response.push({
          team: { id: 7002 },
          player: { id: 8003 },
          time: { elapsed: 40, extra: null },
          type: 'Goal',
          detail: 'Normal Goal',
        });
        corrected.events.payload.results =
          corrected.events.payload.response.length;
        const batch = await f.batch(corrected);
        const before = await db
          .selectFrom('provider_evidence')
          .select('id')
          .execute();
        await sql`CREATE FUNCTION fantasy.acceptance_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic acceptance failure'; END $$`.execute(
          db,
        );
        await sql`CREATE TRIGGER acceptance_failure BEFORE INSERT ON fantasy.provider_acceptances FOR EACH ROW EXECUTE FUNCTION fantasy.acceptance_failure()`.execute(
          db,
        );
        try {
          await assert.rejects(
            acceptNextProviderReport(db),
            /Synthetic acceptance failure/u,
          );
        } finally {
          await sql`DROP TRIGGER acceptance_failure ON fantasy.provider_acceptances`.execute(
            db,
          );
          await sql`DROP FUNCTION fantasy.acceptance_failure()`.execute(db);
        }
        assert.equal(
          (await db.selectFrom('provider_evidence').select('id').execute())
            .length,
          before.length,
        );
        assert.equal(
          (
            await db
              .selectFrom('fixtures')
              .select('data')
              .where('id', '=', f.fixture.id)
              .executeTakeFirstOrThrow()
          ).data.revision,
          3,
        );
        assert.equal(
          (
            await db
              .selectFrom('provider_acceptances')
              .selectAll()
              .where('batch_id', '=', batch.id)
              .execute()
          ).length,
          0,
        );
        const retried = await acceptNextProviderReport(db);
        assert.equal(retried?.state, 'accepted', JSON.stringify(retried));
        assert.equal(retried.fixtureRevision, 4);
        for (const { round } of rounds) {
          const retained = await db
            .selectFrom('gameweeks')
            .select('data')
            .where('id', '=', round.id)
            .executeTakeFirstOrThrow();
          assert.equal(retained.data.status, 'finalized');
          assert.equal(
            (await publishGameweekResults(db, round.id)).status,
            'review',
          );
        }
        assert.deepEqual(
          await db
            .selectFrom('entry_results')
            .selectAll()
            .where(
              'entry_id',
              'in',
              rounds.map((r) => r.entry.id),
            )
            .orderBy('entry_id')
            .execute(),
          scoresBefore,
          'both competitions retain their published scores pending review',
        );
        assert.equal(
          (
            await db
              .selectFrom('fact_revisions')
              .selectAll()
              .where('fixture_id', '=', f.fixture.id)
              .where('is_override', '=', true)
              .execute()
          ).length,
          1,
        );
      },
    );
    await t.test(
      'active fixture dispositions block acceptance and an account pause never spends more quota',
      async () => {
        await executeMatchDataCommand(db, f.principal, f.grants, {
          kind: 'disposition',
          commandId: randomUUID(),
          fixtureId: f.fixture.id,
          expectedRevision: 4,
          choice: { outcome: 'void', replacementFixtureId: null },
          officialReference: 'Synthetic official void decision',
          reason: 'Verify explicit disposition persists through provider sync',
        });
        await f.batch();
        assert.deepEqual((await acceptNextProviderReport(db))?.issues, [
          'fixture-disposition-active',
        ]);
        const quota = await db
          .selectFrom('provider_quota_windows')
          .select(['used', 'ordinary_used'])
          .where('account_id', '=', f.account.id)
          .where('starts_at', '=', f.windowStart)
          .executeTakeFirstOrThrow();
        assert.deepEqual(quota, { used: 4, ordinary_used: 4 });
        await executeProviderAcceptancePolicy(
          db,
          f.principal,
          f.policyCommand(1, false),
        );
        await f.batch();
        assert.equal(await acceptNextProviderReport(db), null);
      },
    );
  } finally {
    await f.restore();
  }
});
