import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  gameweekSchema,
  fixtureSchema,
  lockedEntrySchema,
  entryResultSchema,
  type MatchDataCommand,
} from '@fantasy/contracts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeMatchReview } from '../src/match-review.ts';
import {
  executeEmptyGameweek,
  previewEmptyGameweek,
} from '../src/empty-gameweek.ts';
import { calculateRoundInputs } from '../src/round-inputs.ts';
import { publishGameweekResults } from '../src/results.ts';
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
void test('exceptional fixture decisions and empty-round settlement retain history and require reviewed evidence', async (t) => {
  await seedDemoReplay(db);
  const source = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const original = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', source.id)
      .where('number', '=', 1)
      .executeTakeFirstOrThrow()
  ).data;
  const sourceFixture = (
    await db
      .selectFrom('fixture_assignments')
      .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
      .select('fixtures.data')
      .where('fixture_assignments.gameweek_id', '=', original.id)
      .executeTakeFirstOrThrow()
  ).data;
  const report = (
    await db
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', sourceFixture.id)
      .orderBy('revision', 'desc')
      .executeTakeFirstOrThrow()
  ).payload;
  const sourceEntry = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', source.id)
      .executeTakeFirstOrThrow()
  ).data;
  const sourceSnapshot = (
    await db
      .selectFrom('entry_snapshots')
      .select('payload')
      .where('entry_id', '=', sourceEntry.id)
      .where('gameweek_id', '=', original.id)
      .executeTakeFirstOrThrow()
  ).payload;
  const sourcePool = (
    await db
      .selectFrom('gameweek_player_pools')
      .select('payload')
      .where('gameweek_id', '=', original.id)
      .executeTakeFirstOrThrow()
  ).payload;
  const competition = competitionSchema.parse({
    ...source,
    id: randomUUID(),
    slug: `disposition-${randomUUID()}`,
  });
  const round = gameweekSchema.parse({
    ...original,
    id: randomUUID(),
    competitionId: competition.id,
    status: 'locked',
    resultRevision: 0,
    finalizedAt: null,
    lastMaterialChangeAt: null,
    issues: [],
  });
  const entry = entrySchema.parse({
    ...sourceEntry,
    id: randomUUID(),
    competitionId: competition.id,
    firstGameweekId: round.id,
    editingGameweekId: round.id,
  });
  const snapshot = lockedEntrySchema.parse({
    ...lockedEntrySchema.parse(sourceSnapshot),
    transferDeduction: 4000,
    chip: 'bench-boost',
  });
  const fixture = fixtureSchema.parse({
    ...sourceFixture,
    id: randomUUID(),
    revision: 1,
    status: 'scheduled',
    factsComplete: false,
  });
  const replacement = fixtureSchema.parse({
    ...fixture,
    id: randomUUID(),
    kickoff: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  await db
    .insertInto('competitions')
    .values({
      id: competition.id,
      season_id: competition.seasonId,
      slug: competition.slug,
      revision: competition.revision,
      data: competition,
    })
    .execute();
  await db
    .insertInto('gameweeks')
    .values({
      id: round.id,
      competition_id: competition.id,
      number: round.number,
      deadline: round.deadline,
      data: round,
    })
    .execute();
  await db
    .insertInto('entries')
    .values({
      id: entry.id,
      competition_id: competition.id,
      account_id: entry.accountId,
      revision: entry.revision,
      data: entry,
    })
    .execute();
  await db
    .insertInto('entry_snapshots')
    .values({
      entry_id: entry.id,
      competition_id: competition.id,
      gameweek_id: round.id,
      locked_at: round.deadline,
      payload: snapshot,
    })
    .execute();
  await db
    .insertInto('gameweek_player_pools')
    .values({
      gameweek_id: round.id,
      payload: {
        players: sourcePool.players.map((p) => ({
          ...p,
          competitionId: competition.id,
        })),
      },
    })
    .execute();
  await db
    .insertInto('fixtures')
    .values(
      [fixture, replacement].map((f) => ({
        id: f.id,
        season_id: f.seasonId,
        kickoff: f.kickoff,
        data: f,
      })),
    )
    .execute();
  await db
    .insertInto('fixture_assignments')
    .values({
      competition_id: competition.id,
      gameweek_id: round.id,
      fixture_id: fixture.id,
    })
    .execute();
  const principal = {
    accountId: randomUUID(),
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const grants: StaffGrant[] = [{ role: 'owner', competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const nowFixture = async () =>
    (
      await db
        .selectFrom('fixtures')
        .select('data')
        .where('id', '=', fixture.id)
        .executeTakeFirstOrThrow()
    ).data;
  const nowRound = async () =>
    (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', round.id)
        .executeTakeFirstOrThrow()
    ).data;
  const review = async (command: MatchDataCommand) => {
    const result = await executeMatchReview(db, principal, grants, {
      kind: 'preview',
      command,
    });
    assert.equal(result.kind, 'preview');
    return result.preview;
  };
  const apply = async (command: MatchDataCommand) => {
    const preview = await review(command);
    const result = await executeMatchReview(db, principal, grants, {
      kind: 'apply',
      command,
      expectedFingerprint: preview.fingerprint,
    });
    assert.equal(result.kind, 'applied');
    return result.fixture;
  };
  const disposition = async (
    choice: Extract<MatchDataCommand, { kind: 'disposition' }>['choice'],
  ): Promise<Extract<MatchDataCommand, { kind: 'disposition' }>> => ({
    kind: 'disposition',
    commandId: randomUUID(),
    fixtureId: fixture.id,
    expectedRevision: (await nowFixture()).revision,
    choice,
    officialReference: 'Synthetic official competition bulletin 38',
    reason: 'Synthetic outcome reviewed against official evidence',
  });
  const importReport = async (): Promise<MatchDataCommand> => ({
    kind: 'import',
    commandId: randomUUID(),
    expectedRevision: (await nowFixture()).revision,
    source: 'synthetic-proof',
    reason: 'Synthetic complete cumulative fixture report',
    observation: {
      ...report,
      fixture: {
        ...report.fixture,
        id: fixture.id,
        revision: (await nowFixture()).revision,
      },
    },
  });
  try {
    await apply(await importReport());
    await publishGameweekResults(db, round.id);
    const beforeRound = await nowRound();
    const observations = await db
      .selectFrom('fixture_observations')
      .selectAll()
      .where('fixture_id', '=', fixture.id)
      .execute();
    await t.test(
      'bare terminal status cannot bypass official evidence and manager scope cannot author global decisions',
      async () => {
        const command = await importReport();
        assert.equal(command.kind, 'import');
        await assert.rejects(
          review({
            ...command,
            observation: {
              ...command.observation,
              fixture: { ...command.observation.fixture, status: 'void' },
            },
          }),
          { code: 'fixture-disposition-required' },
        );
        const manager = { ...principal, accountId: randomUUID() };
        await grantProofStaff(db, manager.accountId, [
          { role: 'competition-manager', competitionId: competition.id },
        ]);
        await assert.rejects(
          executeMatchReview(
            db,
            manager,
            [{ role: 'competition-manager', competitionId: competition.id }],
            {
              kind: 'preview',
              command: await disposition({
                outcome: 'void',
                replacementFixtureId: null,
              }),
            },
          ),
          AccessDenied,
        );
        const saved = await nowFixture();
        await db
          .updateTable('fixtures')
          .set({ data: { ...saved, status: 'void' } })
          .where('id', '=', fixture.id)
          .execute();
        try {
          const inputs = await calculateRoundInputs(db, await nowRound());
          assert.equal(inputs.settled, false);
          assert.ok(
            inputs.issues.some((i) =>
              i.includes('fixture-disposition-required'),
            ),
          );
          await assert.rejects(previewEmptyGameweek(db, principal, round.id), {
            code: 'empty-gameweek-not-evidenced',
          });
        } finally {
          await db
            .updateTable('fixtures')
            .set({ data: saved })
            .where('id', '=', fixture.id)
            .execute();
        }
      },
    );
    await t.test(
      'preview is repeatable and rollback-only; stale review rejects without a disposition',
      async () => {
        const command = await disposition({
            outcome: 'void',
            replacementFixtureId: null,
          }),
          a = await review(command),
          b = await review(command);
        assert.deepEqual(a, b);
        assert.equal(
          (
            await db
              .selectFrom('fixture_dispositions')
              .select('id')
              .where('fixture_id', '=', fixture.id)
              .execute()
          ).length,
          0,
        );
        await db
          .updateTable('competitions')
          .set({
            revision: competition.revision + 1,
            data: { ...competition, revision: competition.revision + 1 },
          })
          .where('id', '=', competition.id)
          .execute();
        try {
          await assert.rejects(
            executeMatchReview(db, principal, grants, {
              kind: 'apply',
              command,
              expectedFingerprint: a.fingerprint,
            }),
            { code: 'match-preview-changed' },
          );
        } finally {
          await db
            .updateTable('competitions')
            .set({ revision: competition.revision, data: competition })
            .where('id', '=', competition.id)
            .execute();
        }
      },
    );
    await t.test(
      'concurrent void confirmation preserves original facts and final publication; a normal import cannot undo it',
      async () => {
        const command = await disposition({
            outcome: 'void',
            replacementFixtureId: null,
          }),
          preview = await review(command),
          request = {
            kind: 'apply' as const,
            command,
            expectedFingerprint: preview.fingerprint,
          };
        const [a, b] = await Promise.all([
          executeMatchReview(db, principal, grants, request),
          executeMatchReview(db, principal, grants, request),
        ]);
        assert.deepEqual(a, b);
        assert.equal((await nowFixture()).status, 'void');
        assert.deepEqual(await nowRound(), beforeRound);
        assert.deepEqual(
          await db
            .selectFrom('fixture_observations')
            .selectAll()
            .where('fixture_id', '=', fixture.id)
            .execute(),
          observations,
        );
        assert.equal(
          (await publishGameweekResults(db, round.id)).status,
          'review',
        );
        await assert.rejects(review(await importReport()), {
          code: 'fixture-disposition-active',
        });
      },
    );
    await t.test(
      'zero-performance preview retains hits and chips; failed publication rolls back settlement and open reviews',
      async () => {
        const before = await nowRound(),
          preview = await previewEmptyGameweek(db, principal, round.id);
        assert.equal(preview.settled, true);
        assert.equal(preview.changes[0]?.after, -4000);
        assert.deepEqual(await nowRound(), before);
        assert.equal(
          await db
            .selectFrom('empty_round_settlements')
            .select('gameweek_id')
            .where('gameweek_id', '=', round.id)
            .executeTakeFirst(),
          undefined,
        );
        await pool.query(
          `CREATE FUNCTION fantasy.reject_empty_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic empty publication failure'; END $$; CREATE TRIGGER reject_empty_proof BEFORE INSERT ON fantasy.round_calculations FOR EACH ROW EXECUTE FUNCTION fantasy.reject_empty_proof()`,
        );
        try {
          await assert.rejects(
            executeEmptyGameweek(db, principal, {
              commandId: randomUUID(),
              gameweekId: round.id,
              expectedResultRevision: before.resultRevision,
              expectedFingerprint: preview.fingerprint,
              reason: 'Synthetic approved empty round',
            }),
            /synthetic empty publication failure/,
          );
          assert.deepEqual(await nowRound(), before);
          assert.ok(
            await db
              .selectFrom('result_reviews')
              .select('id')
              .where('gameweek_id', '=', round.id)
              .where('status', '=', 'open')
              .executeTakeFirst(),
          );
          assert.equal(
            await db
              .selectFrom('empty_round_settlements')
              .select('gameweek_id')
              .where('gameweek_id', '=', round.id)
              .executeTakeFirst(),
            undefined,
          );
        } finally {
          await pool.query(
            'DROP TRIGGER reject_empty_proof ON fantasy.round_calculations; DROP FUNCTION fantasy.reject_empty_proof()',
          );
        }
        const command = {
          commandId: randomUUID(),
          gameweekId: round.id,
          expectedResultRevision: before.resultRevision,
          expectedFingerprint: preview.fingerprint,
          reason: 'Synthetic approved empty round',
        };
        const [a, b] = await Promise.all([
          executeEmptyGameweek(db, principal, command),
          executeEmptyGameweek(db, principal, command),
        ]);
        assert.deepEqual(a, b);
        assert.equal(a.resultRevision, before.resultRevision + 1);
        const scored = entryResultSchema.parse(
          (
            await db
              .selectFrom('entry_results')
              .select('payload')
              .where('entry_id', '=', entry.id)
              .where('gameweek_id', '=', round.id)
              .where('revision', '=', a.resultRevision)
              .executeTakeFirstOrThrow()
          ).payload,
        );
        assert.equal(scored.total, -4000);
        assert.equal(scored.playersTotal, 0);
        assert.equal(scored.transferDeduction, 4000);
        assert.deepEqual(
          (
            await db
              .selectFrom('entry_snapshots')
              .select('payload')
              .where('entry_id', '=', entry.id)
              .where('gameweek_id', '=', round.id)
              .executeTakeFirstOrThrow()
          ).payload,
          snapshot,
        );
        assert.equal(
          (await publishGameweekResults(db, round.id)).revision,
          a.resultRevision,
        );
      },
    );
    await t.test(
      'release waits for a reviewed cumulative report and reaccepting the original report restores it once',
      async () => {
        await apply(
          await disposition({ outcome: 'release', replacementFixtureId: null }),
        );
        assert.equal((await nowFixture()).status, 'suspended');
        assert.equal(
          (await calculateRoundInputs(db, await nowRound())).settled,
          false,
        );
        const restored = await apply(await importReport());
        assert.equal(restored.status, 'finished');
        assert.equal(restored.factsComplete, true);
        const inputs = await calculateRoundInputs(db, await nowRound());
        assert.equal(inputs.settled, true);
        assert.ok(inputs.players.some((p) => p.points > 0));
      },
    );
    await t.test(
      'replays require a distinct unplayed fixture and reject a locked destination; awarded scores never manufacture performance',
      async () => {
        await assert.rejects(
          review(
            await disposition({
              outcome: 'replay',
              replacementFixtureId: fixture.id,
            }),
          ),
          { code: 'invalid-replay-fixture' },
        );
        const other = gameweekSchema.parse({
          ...round,
          id: randomUUID(),
          number: 2,
        });
        await db
          .insertInto('gameweeks')
          .values({
            id: other.id,
            competition_id: competition.id,
            number: other.number,
            deadline: other.deadline,
            data: other,
          })
          .execute();
        await db
          .insertInto('fixture_assignments')
          .values({
            competition_id: competition.id,
            gameweek_id: other.id,
            fixture_id: replacement.id,
          })
          .execute();
        try {
          await assert.rejects(
            review(
              await disposition({
                outcome: 'replay',
                replacementFixtureId: replacement.id,
              }),
            ),
            { code: 'replay-destination-locked' },
          );
        } finally {
          await db
            .deleteFrom('fixture_assignments')
            .where('fixture_id', '=', replacement.id)
            .execute();
          await db.deleteFrom('gameweeks').where('id', '=', other.id).execute();
        }
        await apply(
          await disposition({
            outcome: 'replay',
            replacementFixtureId: replacement.id,
          }),
        );
        assert.equal((await nowFixture()).status, 'void');
        assert.equal(
          (await calculateRoundInputs(db, await nowRound())).settled,
          false,
          'New disposition revision requires fresh zero-performance approval',
        );
        await apply(
          await disposition({ outcome: 'release', replacementFixtureId: null }),
        );
        await apply(await importReport());
        await apply(
          await disposition({
            outcome: 'awarded',
            replacementFixtureId: null,
            homeGoals: 3,
            awayGoals: 0,
          }),
        );
        assert.equal((await nowFixture()).status, 'awarded');
        assert.equal((await nowFixture()).homeGoals, 3);
        const inputs = await calculateRoundInputs(db, await nowRound());
        assert.equal(inputs.settled, false);
        assert.ok(inputs.players.every((p) => p.points === 0));
        const preview = await previewEmptyGameweek(db, principal, round.id);
        assert.equal(preview.changes[0]?.after, -4000);
        await apply(
          await disposition({ outcome: 'release', replacementFixtureId: null }),
        );
        const released = await nowFixture();
        assert.equal(released.status, 'suspended');
        assert.equal(released.homeGoals, report.fixture.homeGoals);
        assert.equal(released.awayGoals, report.fixture.awayGoals);
        assert.equal(released.factsComplete, false);
      },
    );
  } finally {
    await db
      .deleteFrom('result_reviews')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('entry_results')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('round_calculations')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('entry_snapshots')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('entries')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('empty_round_settlements')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('gameweek_player_pools')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('fixture_assignments')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('gameweeks')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('staff_grants')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('competitions')
      .where('id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('fixture_dispositions')
      .where('fixture_id', '=', fixture.id)
      .execute();
    await db
      .deleteFrom('fact_revisions')
      .where('fixture_id', '=', fixture.id)
      .execute();
    await db
      .deleteFrom('fixture_observations')
      .where('fixture_id', '=', fixture.id)
      .execute();
    await db
      .deleteFrom('fixtures')
      .where('id', 'in', [fixture.id, replacement.id])
      .execute();
  }
});
