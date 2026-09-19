import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { entryResultSchema, lockedEntrySchema } from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import {
  readCompetitionPulse,
  readPublicRoundStandings,
} from '../src/competition-pulse.ts';
import { readPublicLineup } from '../src/public-lineup.ts';
import { AccessDenied } from '../src/authorization.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});
void test('public competition pulse keeps movement, joint winners and locked formations coherent', async (t) => {
  await seedDemoReplay(db);
  const initial = await readCompetitionPulse(db, 'cairo-replay');
  assert.ok(
    initial.latest &&
      initial.finalRound &&
      initial.lineup &&
      initial.selectedEntryId,
  );
  const latestId = initial.latest.id;
  const round = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', latestId)
      .executeTakeFirstOrThrow()
  ).data;
  const entry = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', initial.selectedEntryId)
      .executeTakeFirstOrThrow()
  ).data;
  const published = await db
    .selectFrom('entry_results')
    .selectAll()
    .where('gameweek_id', '=', latestId)
    .where('revision', '=', round.resultRevision)
    .execute();
  const selected = published.find((r) => r.entry_id === entry.id);
  assert.ok(selected);
  const score = entryResultSchema.parse(selected.payload);
  await t.test(
    'published totals, previous-round rank and round contributions agree with independent score sums',
    async () => {
      const sums = await pool.query<{
        entry_id: string;
        current: string;
        previous: string;
      }>(
        `SELECT e.entry_id,sum(e.points)::text AS current,coalesce(sum(e.points) FILTER (WHERE g.number<$2),0)::text AS previous FROM fantasy.entry_results e JOIN fantasy.gameweeks g ON g.id=e.gameweek_id AND e.revision=(g.data->>'resultRevision')::integer WHERE e.competition_id=$1 AND g.number<=$2 GROUP BY e.entry_id`,
        [initial.competition.id, round.number],
      );
      for (const row of initial.standings) {
        const total = sums.rows.find((r) => r.entry_id === row.entryId);
        assert.ok(total);
        assert.equal(row.points, Number(total.current));
        assert.equal(row.previousPoints, Number(total.previous));
        assert.equal(
          row.roundPoints,
          Number(total.current) - Number(total.previous),
        );
        assert.ok(row.previousRank !== null);
      }
      const full = await readPublicRoundStandings(db, 'cairo-replay', latestId);
      assert.deepEqual(
        initial.winners.map((w) => w.entryId),
        full.standings.filter((r) => r.rank === 1).map((r) => r.entryId),
      );
    },
  );
  await t.test(
    'public pitch ignores future roster edits and exposes no editing state or account identity',
    async () => {
      await db
        .updateTable('entries')
        .set({
          data: {
            ...entry,
            state: {
              ...entry.state,
              roster: { ...entry.state.roster, starterIds: [] },
            },
          },
        })
        .where('id', '=', entry.id)
        .execute();
      try {
        const next = await readPublicLineup(
          db,
          'cairo-replay',
          entry.id,
          latestId,
        );
        assert.deepEqual(next.lineup, initial.lineup);
        assert.deepEqual(Object.keys(next.entry).sort(), ['id', 'name']);
        assert.equal(JSON.stringify(next).includes('purchasePrice'), false);
      } finally {
        await db
          .updateTable('entries')
          .set({ data: entry })
          .where('id', '=', entry.id)
          .execute();
      }
    },
  );
  await t.test(
    'unpublished revisions do not alter the board and an unknown jersey remains unknown',
    async () => {
      const future = entryResultSchema.parse({ ...score, total: 900000 });
      await db
        .insertInto('entry_results')
        .values({
          ...selected,
          revision: round.resultRevision + 1,
          points: future.total,
          payload: future,
        })
        .execute();
      try {
        assert.deepEqual(
          (await readCompetitionPulse(db, 'cairo-replay')).standings,
          initial.standings,
        );
      } finally {
        await db
          .deleteFrom('entry_results')
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', latestId)
          .where('revision', '=', round.resultRevision + 1)
          .execute();
      }
      const playerId = initial.lineup?.players[0]?.id;
      assert.ok(playerId);
      const player = (
        await db
          .selectFrom('footballers')
          .select('data')
          .where('id', '=', playerId)
          .executeTakeFirstOrThrow()
      ).data;
      await db
        .updateTable('footballers')
        .set({ data: { ...player, shirtNumber: null } })
        .where('id', '=', playerId)
        .execute();
      try {
        assert.equal(
          (
            await readPublicLineup(db, 'cairo-replay', entry.id, latestId)
          ).lineup?.players.find((p) => p.id === playerId)?.shirtNumber,
          null,
        );
      } finally {
        await db
          .updateTable('footballers')
          .set({ data: player })
          .where('id', '=', playerId)
          .execute();
      }
    },
  );
  await t.test(
    'negative round scores produce down movement and retain a scored entry in the full round list',
    async () => {
      const negative = entryResultSchema.parse({ ...score, total: -900000 });
      await db
        .updateTable('entry_results')
        .set({ points: negative.total, payload: negative })
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', latestId)
        .where('revision', '=', round.resultRevision)
        .execute();
      try {
        const changed = await readCompetitionPulse(db, 'cairo-replay');
        const row = changed.standings.find((r) => r.entryId === entry.id);
        assert.ok(row && row.previousRank !== null);
        assert.equal(row.roundPoints, -900000);
        assert.ok(row.rank > row.previousRank);
        assert.ok(
          (
            await readPublicRoundStandings(db, 'cairo-replay', latestId)
          ).standings.some(
            (r) => r.entryId === entry.id && r.points === -900000,
          ),
        );
      } finally {
        await db
          .updateTable('entry_results')
          .set({ points: selected.points, payload: selected.payload })
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', latestId)
          .where('revision', '=', round.resultRevision)
          .execute();
      }
    },
  );
  await t.test(
    'shared winners are all retained and any tied winner can be selected without inventing a tie-break',
    async () => {
      for (const r of published) {
        const tied = entryResultSchema.parse({
          ...entryResultSchema.parse(r.payload),
          total: 1000,
          transferDeduction: 0,
          goals: 0,
        });
        await db
          .updateTable('entry_results')
          .set({ points: 1000, payload: tied })
          .where('entry_id', '=', r.entry_id)
          .where('gameweek_id', '=', latestId)
          .where('revision', '=', round.resultRevision)
          .execute();
      }
      try {
        const tied = await readCompetitionPulse(db, 'cairo-replay');
        assert.equal(tied.winners.length, published.length);
        const other = tied.winners.at(-1);
        assert.ok(other);
        assert.equal(
          (await readCompetitionPulse(db, 'cairo-replay', other.entryId))
            .selectedEntryId,
          other.entryId,
        );
      } finally {
        for (const r of published)
          await db
            .updateTable('entry_results')
            .set({ points: r.points, payload: r.payload })
            .where('entry_id', '=', r.entry_id)
            .where('gameweek_id', '=', latestId)
            .where('revision', '=', round.resultRevision)
            .execute();
      }
    },
  );
  await t.test(
    'a missing published entry result holds winners instead of silently dropping a contender',
    async () => {
      await db
        .deleteFrom('entry_results')
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', latestId)
        .where('revision', '=', round.resultRevision)
        .execute();
      try {
        const held = await readCompetitionPulse(db, 'cairo-replay');
        assert.equal(held.winnersHeld, true);
        assert.deepEqual(held.winners, []);
        assert.equal(held.lineup, null);
      } finally {
        await db.insertInto('entry_results').values(selected).execute();
      }
    },
  );
  await t.test(
    'Bench Boost preserves an eleven-player pitch and separately shows four scoring reserves',
    async () => {
      const snapshot = await db
        .selectFrom('entry_snapshots')
        .selectAll()
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', latestId)
        .executeTakeFirstOrThrow();
      const locked = lockedEntrySchema.parse(snapshot.payload);
      const effectiveIds = locked.roster.holdings.map((h) => h.footballerId);
      await db
        .updateTable('entry_snapshots')
        .set({ payload: { ...locked, chip: 'bench-boost' } })
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', latestId)
        .execute();
      await db
        .updateTable('entry_results')
        .set({ payload: { ...score, effectiveIds } })
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', latestId)
        .where('revision', '=', round.resultRevision)
        .execute();
      try {
        const { lineup } = await readPublicLineup(
          db,
          'cairo-replay',
          entry.id,
          latestId,
        );
        assert.ok(lineup);
        assert.deepEqual(lineup.pitchIds, locked.roster.starterIds);
        assert.equal(lineup.pitchIds.length, 11);
        assert.equal(lineup.benchIds.length, 4);
        assert.equal(lineup.players.filter((p) => p.counted).length, 15);
      } finally {
        await db
          .updateTable('entry_snapshots')
          .set({ payload: snapshot.payload })
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', latestId)
          .execute();
        await db
          .updateTable('entry_results')
          .set({ payload: selected.payload })
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', latestId)
          .where('revision', '=', round.resultRevision)
          .execute();
      }
    },
  );
  await t.test(
    'unresolved review withholds winners and draft competitions cannot be read',
    async () => {
      const id = randomUUID();
      await db
        .insertInto('result_reviews')
        .values({
          id,
          gameweek_id: latestId,
          reason: 'Synthetic public winner hold',
          status: 'open',
          evidence_id: null,
          resolved_at: null,
          resolved_by: null,
        })
        .execute();
      try {
        const held = await readCompetitionPulse(db, 'cairo-replay');
        assert.equal(held.winnersHeld, true);
        assert.deepEqual(held.winners, []);
        assert.equal(held.lineup, null);
      } finally {
        await db.deleteFrom('result_reviews').where('id', '=', id).execute();
      }
      const competition = (
        await db
          .selectFrom('competitions')
          .select('data')
          .where('id', '=', initial.competition.id)
          .executeTakeFirstOrThrow()
      ).data;
      await db
        .updateTable('competitions')
        .set({ data: { ...competition, status: 'draft' } })
        .where('id', '=', competition.id)
        .execute();
      try {
        await assert.rejects(
          readCompetitionPulse(db, 'cairo-replay'),
          AccessDenied,
        );
        await assert.rejects(
          readPublicLineup(db, 'cairo-replay', entry.id, latestId),
          AccessDenied,
        );
        await assert.rejects(
          readPublicRoundStandings(db, 'cairo-replay', latestId),
          AccessDenied,
        );
      } finally {
        await db
          .updateTable('competitions')
          .set({ data: competition })
          .where('id', '=', competition.id)
          .execute();
      }
    },
  );
});
