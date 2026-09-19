import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  entryResultSchema,
  gameweekSchema,
  leagueGroupSchema,
  headToHeadEditionSchema,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import {
  calculateGroupResultImpact,
  visibleGroupImpact,
} from '../src/group-result-impact.ts';
import { leagueGroupDetails } from '../src/group-query.ts';
import { headToHeadDetails } from '../src/head-to-head-query.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});

void test('group correction projections follow canonical published tables, private access and all dependency changes', async (t) => {
  await seedDemoReplay(db);
  const template = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const competition = competitionSchema.parse({
    ...template,
    id: randomUUID(),
    slug: `group-impact-${randomUUID()}`,
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
  const templateRound = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', template.id)
      .where('number', '=', 1)
      .executeTakeFirstOrThrow()
  ).data;
  const rounds = [1, 2].map((number) =>
    gameweekSchema.parse({
      ...templateRound,
      id: randomUUID(),
      competitionId: competition.id,
      number,
      status: 'finalized',
      resultRevision: 1,
    }),
  );
  const [round, later] = rounds;
  assert.ok(round && later);
  for (const data of rounds)
    await db
      .insertInto('gameweeks')
      .values({
        id: data.id,
        competition_id: competition.id,
        number: data.number,
        deadline: data.deadline,
        data,
      })
      .execute();
  const originals = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', template.id)
      .orderBy('id')
      .execute()
  ).map((r) => r.data);
  const unique = originals
    .filter(
      (e, i) => originals.findIndex((o) => o.accountId === e.accountId) === i,
    )
    .slice(0, 3);
  assert.equal(unique.length, 3);
  const entries = unique.map((e, i) =>
    entrySchema.parse({
      ...e,
      id: randomUUID(),
      competitionId: competition.id,
      firstGameweekId: round.id,
      editingGameweekId: later.id,
      name: `Impact ${String(i)}`,
    }),
  );
  const [a, b, outsider] = entries;
  assert.ok(a && b && outsider);
  for (const data of entries)
    await db
      .insertInto('entries')
      .values({
        id: data.id,
        competition_id: competition.id,
        account_id: data.accountId,
        revision: data.revision,
        data,
      })
      .execute();
  const originalScore = (
    await db
      .selectFrom('entry_results')
      .select('payload')
      .where('competition_id', '=', template.id)
      .executeTakeFirstOrThrow()
  ).payload;
  const score = (total: number) =>
    entryResultSchema.parse({
      ...entryResultSchema.parse(originalScore),
      total,
      settled: true,
    });
  for (const r of rounds)
    for (const [index, entry] of [a, b].entries()) {
      const payload = score(
        r.id === round.id ? (index === 0 ? 10000 : 9000) : 0,
      );
      await db
        .insertInto('entry_results')
        .values({
          entry_id: entry.id,
          competition_id: competition.id,
          gameweek_id: r.id,
          revision: 1,
          points: payload.total,
          payload,
          published_at: new Date(),
        })
        .execute();
    }
  const group = leagueGroupSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    organizerId: a.accountId,
    name: 'Correction members',
    description: 'Synthetic',
    visibility: 'public',
    approvalRequired: false,
    entryLimit: 3,
    startGameweekId: null,
    revision: 1,
    createdAt: new Date().toISOString(),
  });
  const delayed = {
    ...group,
    id: randomUUID(),
    name: 'Starts later',
    startGameweekId: later.id,
  };
  const privateGroup = {
    ...group,
    id: randomUUID(),
    name: 'Private correction scope',
    visibility: 'private' as const,
  };
  for (const data of [group, delayed, privateGroup]) {
    await db
      .insertInto('league_groups')
      .values({
        id: data.id,
        competition_id: competition.id,
        organizer_id: data.organizerId,
        invitation_hash: 'a'.repeat(64),
        revision: 1,
        data,
      })
      .execute();
    for (const e of [a, b, outsider])
      await db
        .insertInto('group_memberships')
        .values({
          group_id: data.id,
          competition_id: competition.id,
          entry_id: e.id,
          account_id: e.accountId,
          status: e.id === outsider.id ? 'pending' : 'active',
        })
        .execute();
  }
  const edition = headToHeadEditionSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    groupId: group.id,
    name: 'Correction matchups',
    status: 'published',
    revision: 1,
    gameweekIds: rounds.map((r) => r.id),
    seed: 'a'.repeat(32),
    tieBreak: 'shared',
    tablePoints: { win: 3, draw: 1, loss: 0 },
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    schedule: rounds.map((r) => ({
      gameweekId: r.id,
      homeId: a.id,
      awayId: b.id,
      cycle: r.number,
    })),
  });
  await db
    .insertInto('h2h_editions')
    .values({
      id: edition.id,
      competition_id: competition.id,
      group_id: group.id,
      revision: 1,
      data: edition,
    })
    .execute();
  for (const e of [a, b])
    await db
      .insertInto('h2h_registrations')
      .values({
        edition_id: edition.id,
        competition_id: competition.id,
        entry_id: e.id,
      })
      .execute();
  const replacement = new Map([
    [a.id, score(8000)],
    [b.id, score(9000)],
  ]);
  const preview = () =>
    db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute((tx) =>
        calculateGroupResultImpact(tx, competition, round, replacement),
      );
  const original = await preview();
  const projected = original.groups.find((g) => g.group.id === group.id);
  assert.ok(projected);
  await t.test(
    'classic membership/start round and H2H win changes are projected without writes',
    async () => {
      assert.equal(
        original.groups.some((g) => g.group.id === delayed.id),
        false,
      );
      assert.deepEqual(
        projected.classic?.rankings?.find((r) => r.entryId === a.id),
        {
          entryId: a.id,
          name: a.name,
          beforeRank: 1,
          afterRank: 2,
          beforePoints: 10000,
          afterPoints: 8000,
        },
      );
      assert.equal(
        projected.classic.rankings.some((r) => r.entryId === outsider.id),
        false,
      );
      assert.equal(projected.headToHead[0]?.before.matches[0]?.outcome, 'home');
      assert.equal(projected.headToHead[0].after?.matches[0]?.outcome, 'away');
      assert.equal(projected.headToHead[0].after.table[0]?.entryId, b.id);
      assert.equal(
        (
          await db
            .selectFrom('gameweeks')
            .select('data')
            .where('id', '=', round.id)
            .executeTakeFirstOrThrow()
        ).data.resultRevision,
        1,
      );
      assert.equal(
        (
          await db
            .selectFrom('entry_results')
            .select('points')
            .where('entry_id', '=', a.id)
            .where('gameweek_id', '=', round.id)
            .executeTakeFirstOrThrow()
        ).points,
        10000,
      );
    },
  );
  await t.test(
    'private associations stay hidden from outsiders and pending members, but remain fingerprint dependencies',
    async () => {
      const visible = await db
        .transaction()
        .execute((tx) => visibleGroupImpact(tx, original, outsider.accountId));
      assert.equal(visible.restrictedGroups, 1);
      assert.equal(JSON.stringify(visible).includes(privateGroup.id), false);
      assert.equal(JSON.stringify(visible).includes(privateGroup.name), false);
      const member = await db
        .transaction()
        .execute((tx) => visibleGroupImpact(tx, original, b.accountId));
      assert.equal(member.restrictedGroups, 0);
      await db
        .updateTable('group_memberships')
        .set({ status: 'left' })
        .where('group_id', '=', privateGroup.id)
        .where('entry_id', '=', b.id)
        .execute();
      assert.notEqual((await preview()).fingerprint, original.fingerprint);
      await db
        .updateTable('group_memberships')
        .set({ status: 'active' })
        .where('group_id', '=', privateGroup.id)
        .where('entry_id', '=', b.id)
        .execute();
    },
  );
  await t.test(
    'incomplete replacement blocks both projections instead of dropping an entry',
    async () => {
      const blocked = await db
        .transaction()
        .execute((tx) =>
          calculateGroupResultImpact(tx, competition, round, null),
        );
      const g = blocked.groups.find((item) => item.group.id === group.id);
      assert.ok(g);
      assert.equal(g.classic?.rankings, null);
      assert.equal(g.headToHead[0]?.after, null);
    },
  );
  await t.test(
    'membership, edition policy, forfeits and other published round scores invalidate dependencies',
    async () => {
      await db
        .updateTable('group_memberships')
        .set({ status: 'left' })
        .where('group_id', '=', group.id)
        .where('entry_id', '=', b.id)
        .execute();
      assert.notEqual((await preview()).fingerprint, original.fingerprint);
      await db
        .updateTable('group_memberships')
        .set({ status: 'active' })
        .where('group_id', '=', group.id)
        .where('entry_id', '=', b.id)
        .execute();
      await db
        .updateTable('h2h_editions')
        .set({
          revision: 2,
          data: {
            ...edition,
            revision: 2,
            tablePoints: { win: 5, draw: 1, loss: 0 },
          },
        })
        .where('id', '=', edition.id)
        .execute();
      assert.notEqual((await preview()).fingerprint, original.fingerprint);
      await db
        .updateTable('h2h_editions')
        .set({ revision: 1, data: edition })
        .where('id', '=', edition.id)
        .execute();
      await db
        .insertInto('h2h_forfeits')
        .values({
          edition_id: edition.id,
          competition_id: competition.id,
          entry_id: b.id,
          gameweek_id: round.id,
          reason: 'Synthetic recorded forfeit',
        })
        .execute();
      const forfeited = await preview();
      assert.notEqual(forfeited.fingerprint, original.fingerprint);
      assert.equal(
        forfeited.groups.find((g) => g.group.id === group.id)?.headToHead[0]
          ?.after?.matches[0]?.outcome,
        'home',
      );
      await db
        .deleteFrom('h2h_forfeits')
        .where('edition_id', '=', edition.id)
        .execute();
      const futureScore = score(100000);
      await db
        .insertInto('entry_results')
        .values({
          entry_id: a.id,
          competition_id: competition.id,
          gameweek_id: later.id,
          revision: 2,
          points: futureScore.total,
          payload: futureScore,
          published_at: new Date(),
        })
        .execute();
      assert.equal(
        (await preview()).fingerprint,
        original.fingerprint,
        'An unpublished result revision must not enter the preview',
      );
      await db
        .updateTable('gameweeks')
        .set({ data: { ...later, resultRevision: 2 } })
        .where('id', '=', later.id)
        .execute();
      assert.notEqual((await preview()).fingerprint, original.fingerprint);
      await db
        .updateTable('gameweeks')
        .set({ data: later })
        .where('id', '=', later.id)
        .execute();
    },
  );
  await t.test(
    'the confirmed replacement produces exactly the projected public classic and H2H tables',
    async () => {
      for (const [entryId, payload] of replacement)
        await db
          .insertInto('entry_results')
          .values({
            entry_id: entryId,
            competition_id: competition.id,
            gameweek_id: round.id,
            revision: 2,
            points: payload.total,
            payload,
            published_at: new Date(),
          })
          .execute();
      await db
        .updateTable('gameweeks')
        .set({ data: { ...round, resultRevision: 2 } })
        .where('id', '=', round.id)
        .execute();
      const actual = await leagueGroupDetails(db, group.id, null);
      assert.deepEqual(
        actual.standings.map((r) => ({
          id: r.entryId,
          rank: r.rank,
          points: r.points,
        })),
        projected.classic?.rankings
          ?.map((r) => ({
            id: r.entryId,
            rank: r.afterRank,
            points: r.afterPoints,
          }))
          .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)),
      );
      const actualH2H = await headToHeadDetails(db, edition.id, null);
      assert.deepEqual(actualH2H.table, projected.headToHead[0]?.after?.table);
      assert.equal(
        actualH2H.matches.find((m) => m.gameweekId === round.id)?.outcome,
        projected.headToHead[0]?.after?.matches[0]?.outcome,
      );
    },
  );
});
