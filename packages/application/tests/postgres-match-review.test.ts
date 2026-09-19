import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  type MatchDataCommand,
} from '@fantasy/contracts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeMatchReview } from '../src/match-review.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import { AccessDenied, type StaffGrant } from '../src/authorization.ts';
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
void test('global match review rolls back real writes, covers shared competitions and binds restricted dependencies', async (t) => {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const round = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competition.id)
      .where('number', '=', 1)
      .executeTakeFirstOrThrow()
  ).data;
  const fixture = (
    await db
      .selectFrom('fixture_assignments')
      .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
      .select('fixtures.data')
      .where('fixture_assignments.gameweek_id', '=', round.id)
      .orderBy('fixtures.id')
      .executeTakeFirstOrThrow()
  ).data;
  const report = (
    await db
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', fixture.id)
      .orderBy('revision', 'desc')
      .executeTakeFirstOrThrow()
  ).payload;
  const player = report.performances.find(
    (p) => (p.statistics.minutes ?? 0) > 0,
  );
  assert.ok(player);
  const fact = await db
    .selectFrom('fact_revisions')
    .select('revision')
    .where('fixture_id', '=', fixture.id)
    .where('footballer_id', '=', player.footballerId)
    .orderBy('revision', 'desc')
    .executeTakeFirstOrThrow();
  const second = competitionSchema.parse({
    ...competition,
    id: randomUUID(),
    slug: `shared-review-${randomUUID()}`,
    name: { en: 'Restricted sponsor game', ar: 'بطولة الراعي' },
  });
  await db
    .insertInto('competitions')
    .values({
      id: second.id,
      season_id: second.seasonId,
      slug: second.slug,
      revision: second.revision,
      data: second,
    })
    .execute();
  const other = gameweekSchema.parse({
    ...round,
    id: randomUUID(),
    competitionId: second.id,
  });
  await db
    .insertInto('gameweeks')
    .values({
      id: other.id,
      competition_id: second.id,
      number: other.number,
      deadline: other.deadline,
      data: other,
    })
    .execute();
  await db
    .insertInto('fixture_assignments')
    .values({
      fixture_id: fixture.id,
      competition_id: second.id,
      gameweek_id: other.id,
    })
    .execute();
  const frozen = await db
    .selectFrom('gameweek_player_pools')
    .select('payload')
    .where('gameweek_id', '=', round.id)
    .executeTakeFirstOrThrow();
  await db
    .insertInto('gameweek_player_pools')
    .values({
      gameweek_id: other.id,
      payload: {
        players: frozen.payload.players.map((p) => ({
          ...p,
          competitionId: second.id,
        })),
      },
    })
    .execute();
  const principal = {
    accountId: randomUUID(),
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const grants: StaffGrant[] = [
    { role: 'data-steward', competitionId: null },
    { role: 'competition-manager', competitionId: competition.id },
  ];
  await grantProofStaff(db, principal.accountId, grants);
  const command: MatchDataCommand = {
    kind: 'override',
    commandId: randomUUID(),
    fixtureId: fixture.id,
    footballerId: player.footballerId,
    expectedRevision: fact.revision,
    reason: 'Synthetic shared match correction',
    change: {
      kind: 'performance',
      statistics: {
        ...player.statistics,
        assists: (player.statistics.assists ?? 0) + 1,
      },
      discipline: player.discipline,
    },
  };
  const readCounts = async () =>
    Promise.all(
      [
        'fact_revisions',
        'commands',
        'audit_events',
        'result_reviews',
        'entry_results',
      ].map((table) =>
        pool
          .query<{ n: number }>(
            `SELECT count(*)::integer AS n FROM fantasy.${table}`,
          )
          .then((r) => r.rows[0]?.n),
      ),
    );
  const counts = await readCounts();
  const initial = await executeMatchReview(db, principal, grants, {
    kind: 'preview',
    command,
  });
  assert.equal(initial.kind, 'preview');
  await t.test(
    'preview persists nothing and withholds restricted competition metadata',
    async () => {
      assert.equal(initial.preview.affectedCompetitions, 2);
      assert.equal(initial.preview.restrictedCompetitions, 1);
      assert.equal(initial.preview.rounds.length, 1);
      assert.equal(JSON.stringify(initial).includes(second.id), false);
      assert.equal(JSON.stringify(initial).includes(second.name.en), false);
      assert.deepEqual(await readCounts(), counts);
      assert.deepEqual(
        (
          await db
            .selectFrom('fixtures')
            .select('data')
            .where('id', '=', fixture.id)
            .executeTakeFirstOrThrow()
        ).data,
        fixture,
      );
      assert.deepEqual(
        await executeMatchReview(db, principal, grants, {
          kind: 'preview',
          command,
        }),
        initial,
      );
    },
  );
  await t.test(
    'a hidden competition change rejects confirmation and rolls back the proposed facts',
    async () => {
      await db
        .updateTable('competitions')
        .set({
          revision: second.revision + 1,
          data: { ...second, revision: second.revision + 1 },
        })
        .where('id', '=', second.id)
        .execute();
      await assert.rejects(
        executeMatchReview(db, principal, grants, {
          kind: 'apply',
          command,
          expectedFingerprint: initial.preview.fingerprint,
        }),
        { code: 'match-preview-changed' },
      );
      assert.deepEqual(await readCounts(), counts);
      await db
        .updateTable('competitions')
        .set({ revision: second.revision, data: second })
        .where('id', '=', second.id)
        .execute();
    },
  );
  await t.test(
    'new assignments invalidate the global review, and scoped data authority is insufficient',
    async () => {
      await assert.rejects(
        executeMatchReview(
          db,
          principal,
          [{ role: 'data-steward', competitionId: competition.id }],
          { kind: 'preview', command },
        ),
        AccessDenied,
      );
      const upcoming = {
        ...other,
        id: randomUUID(),
        number: 2,
        status: 'upcoming' as const,
        resultRevision: 0,
      };
      await db
        .insertInto('gameweeks')
        .values({
          id: upcoming.id,
          competition_id: second.id,
          number: 2,
          deadline: upcoming.deadline,
          data: upcoming,
        })
        .execute();
      await db
        .updateTable('fixture_assignments')
        .set({ gameweek_id: upcoming.id })
        .where('fixture_id', '=', fixture.id)
        .where('competition_id', '=', second.id)
        .execute();
      await assert.rejects(
        executeMatchReview(db, principal, grants, {
          kind: 'apply',
          command,
          expectedFingerprint: initial.preview.fingerprint,
        }),
        { code: 'match-preview-changed' },
      );
      await db
        .updateTable('fixture_assignments')
        .set({ gameweek_id: other.id })
        .where('fixture_id', '=', fixture.id)
        .where('competition_id', '=', second.id)
        .execute();
      await db.deleteFrom('gameweeks').where('id', '=', upcoming.id).execute();
    },
  );
  await t.test(
    'reviewed apply retries once, preserves final results and records the exact reviewed impact',
    async () => {
      const request = {
        kind: 'apply' as const,
        command,
        expectedFingerprint: initial.preview.fingerprint,
      };
      const [a, b] = await Promise.all([
        executeMatchReview(db, principal, grants, request),
        executeMatchReview(db, principal, grants, request),
      ]);
      assert.deepEqual(a, b);
      assert.equal(a.kind, 'applied');
      assert.equal(
        (
          await db
            .selectFrom('fact_revisions')
            .select('id')
            .where('actor_id', '=', principal.accountId)
            .execute()
        ).length,
        1,
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
      const audit = await db
        .selectFrom('audit_events')
        .select('payload')
        .where('actor_id', '=', principal.accountId)
        .where('action', '=', 'match-data.reviewed')
        .execute();
      assert.equal(audit.length, 1);
      assert.deepEqual(audit[0]?.payload, {
        reviewedFingerprint: initial.preview.fingerprint,
        affectedCompetitions: 2,
        affectedRounds: 2,
      });
      await assert.rejects(
        executeMatchReview(db, principal, grants, {
          ...request,
          expectedFingerprint: '0'.repeat(64),
        }),
        { code: 'idempotency-conflict' },
      );
    },
  );
  // Restore the shared synthetic fixture for other regression suites. No external data is used.
  await db
    .deleteFrom('fact_revisions')
    .where('actor_id', '=', principal.accountId)
    .execute();
  await db
    .updateTable('fixtures')
    .set({ data: fixture })
    .where('id', '=', fixture.id)
    .execute();
  await db
    .deleteFrom('fixture_assignments')
    .where('competition_id', '=', second.id)
    .execute();
  await db
    .deleteFrom('gameweek_player_pools')
    .where('gameweek_id', '=', other.id)
    .execute();
  await db.deleteFrom('gameweeks').where('id', '=', other.id).execute();
  await db.deleteFrom('competitions').where('id', '=', second.id).execute();
});
