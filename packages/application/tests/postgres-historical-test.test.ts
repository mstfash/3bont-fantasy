import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { competitionSchema } from '@fantasy/contracts';
import { seedHistoricalTestDraft } from '../src/historical-test-draft.ts';
import { planHistoricalTestDraft } from '../src/historical-test-plan.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { readCompetitionPulse } from '../src/competition-pulse.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 3 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});

const payload = () => ({
  get: 'fixtures',
  parameters: { league: '233', season: '2024' },
  errors: [],
  paging: { current: 1, total: 1 },
  results: 9,
  response: Array.from({ length: 9 }, (_, index) => ({
    fixture: {
      id: 900101 + index,
      date: `2024-10-30T${String(14 + index).padStart(2, '0')}:00:00Z`,
      status: { short: 'FT' },
    },
    league: { id: 233, season: 2024, round: 'Regular Season - 1' },
    teams: {
      home: { id: 2001 + index * 2, name: `Fixture home ${String(index)}` },
      away: { id: 2002 + index * 2, name: `Fixture away ${String(index)}` },
    },
    goals: { home: 0, away: 0 },
  })),
});

void test('historical test import is atomic, isolated, idempotent and never accepts scores or locks drafts', async () => {
  const source = payload();
  const plan = planHistoricalTestDraft(source);
  try {
    for (const invalid of [
      { ...source, parameters: { league: '233', season: '2026' } },
      { ...source, errors: { plan: 'No season access' } },
      { ...source, paging: { current: 1, total: 2 } },
      { ...source, response: source.response.slice(1), results: 8 },
      {
        ...source,
        response: source.response.map((row) => ({
          ...row,
          fixture: { ...row.fixture, id: 900101 },
        })),
      },
    ])
      await assert.rejects(
        seedHistoricalTestDraft(db, invalid, 'a'.repeat(64)),
      );
    assert.equal(
      await db
        .selectFrom('seasons')
        .select('id')
        .where('id', '=', plan.season.id)
        .executeTakeFirst(),
      undefined,
    );
    const results = await Promise.all([
      seedHistoricalTestDraft(db, source, 'a'.repeat(64)),
      seedHistoricalTestDraft(db, source, 'a'.repeat(64)),
    ]);
    assert.deepEqual(results.map((result) => result.state).sort(), [
      'created',
      'exists',
    ]);
    const fixtures = await db
      .selectFrom('fixtures')
      .select('data')
      .where('season_id', '=', plan.season.id)
      .execute();
    assert.equal(fixtures.length, 9);
    assert.ok(
      fixtures.every(
        (row) =>
          !row.data.factsComplete && row.data.kickoff.startsWith('2024-10-30'),
      ),
    );
    assert.equal(
      (
        await db
          .selectFrom('clubs')
          .select('id')
          .where('season_id', '=', plan.season.id)
          .execute()
      ).length,
      18,
    );
    assert.equal(
      (
        await db
          .selectFrom('footballers')
          .select('id')
          .where('season_id', '=', plan.season.id)
          .execute()
      ).length,
      0,
    );
    assert.equal(
      (await advanceDueGameweeks(db, plan.competition.id)).locked,
      0,
    );
    await assert.rejects(readCompetitionPulse(db, plan.competition.slug));
    const edited = {
      ...plan.competition,
      name: { en: 'Operator edited draft', ar: 'مسودة معدلة' },
      revision: 2,
    };
    await db
      .updateTable('competitions')
      .set({ revision: 2, data: edited })
      .where('id', '=', edited.id)
      .execute();
    await seedHistoricalTestDraft(db, source, 'a'.repeat(64));
    assert.equal(
      (
        await db
          .selectFrom('competitions')
          .select('data')
          .where('id', '=', edited.id)
          .executeTakeFirstOrThrow()
      ).data.name.en,
      edited.name.en,
    );
    const changed = payload();
    const first = changed.response[0];
    assert.ok(first);
    first.goals.home = 1;
    await assert.rejects(
      seedHistoricalTestDraft(db, changed, 'b'.repeat(64)),
      /source changed/u,
    );
    assert.equal(
      (
        await db
          .selectFrom('audit_events')
          .select('id')
          .where('scope_id', '=', plan.competition.id)
          .execute()
      ).length,
      1,
    );
  } finally {
    await db
      .deleteFrom('audit_events')
      .where('scope_id', '=', plan.competition.id)
      .execute();
    await db
      .deleteFrom('fixture_assignments')
      .where('competition_id', '=', plan.competition.id)
      .execute();
    await db
      .deleteFrom('gameweeks')
      .where('competition_id', '=', plan.competition.id)
      .execute();
    await db
      .deleteFrom('competitions')
      .where('id', '=', plan.competition.id)
      .execute();
    await db
      .deleteFrom('fixtures')
      .where('season_id', '=', plan.season.id)
      .execute();
    await db
      .deleteFrom('clubs')
      .where('season_id', '=', plan.season.id)
      .execute();
    await db.deleteFrom('seasons').where('id', '=', plan.season.id).execute();
  }
});

void test('overdue inactive competitions cannot starve the fifty-slot deadline batch', async () => {
  const plan = planHistoricalTestDraft(payload());
  const seasonId = randomUUID();
  const ids: string[] = [],
    roundIds: string[] = [];
  try {
    await db
      .insertInto('seasons')
      .values({
        id: seasonId,
        data: { ...plan.season, id: seasonId, synthetic: true },
      })
      .execute();
    for (let index = 0; index < 52; index++) {
      const id = randomUUID(),
        roundId = randomUUID();
      ids.push(id);
      roundIds.push(roundId);
      const state =
        index === 51
          ? 'published'
          : index % 3 === 0
            ? 'draft'
            : index % 3 === 1
              ? 'completed'
              : 'archived';
      const deadline =
        index === 51 ? '2024-11-01T12:30:00Z' : '2024-10-30T12:30:00Z';
      const competition = competitionSchema.parse({
        ...plan.competition,
        id,
        seasonId,
        slug: `deadline-discovery-${id}`,
        status: state,
      });
      await db
        .insertInto('competitions')
        .values({
          id,
          season_id: seasonId,
          slug: competition.slug,
          revision: 1,
          data: competition,
        })
        .execute();
      await db
        .insertInto('gameweeks')
        .values({
          id: roundId,
          competition_id: id,
          number: 1,
          deadline,
          data: { ...plan.round, id: roundId, competitionId: id, deadline },
        })
        .execute();
    }
    const activeId = ids[51],
      activeRoundId = roundIds[51];
    assert.ok(activeId && activeRoundId);
    await advanceDueGameweeks(db);
    const active = await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', activeRoundId)
      .executeTakeFirstOrThrow();
    assert.equal(active.data.status, 'locked');
    const inactive = await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', 'in', roundIds.slice(0, 51))
      .execute();
    assert.ok(inactive.every((row) => row.data.status === 'upcoming'));
    const repeated = await advanceDueGameweeks(db, activeId);
    assert.equal(repeated.locked, 0);
  } finally {
    if (ids.length) {
      await db
        .deleteFrom('gameweek_player_pools')
        .where('gameweek_id', 'in', roundIds)
        .execute();
      await db
        .deleteFrom('gameweeks')
        .where('competition_id', 'in', ids)
        .execute();
      await db.deleteFrom('competitions').where('id', 'in', ids).execute();
    }
    await db.deleteFrom('seasons').where('id', '=', seasonId).execute();
  }
});
