import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProviderMatch } from '../src/provider-match-parser.ts';
import { providerTimelineFixture } from './provider-timeline-fixture.ts';
import { normalizationFixture } from './provider-normalization-fixture.ts';
import { CommandRejected } from '../src/errors.ts';
void test('provider draft preserves missing values, never infers unused-bench minutes or on-pitch goals, and records used mappings', () => {
  const f = normalizationFixture(),
    draft = parseProviderMatch(f.fixture, f.binding, f.mappings, f.sources);
  assert.equal(draft.observation.fixture.status, 'finished');
  assert.equal(draft.observation.fixture.factsComplete, false);
  assert.equal(draft.observation.eligibilityComplete, false);
  const starter = draft.observation.performances.find(
    (p) => p.footballerId === f.players[0],
  );
  const bench = draft.observation.performances.find(
    (p) => p.footballerId === f.players[1],
  );
  assert.ok(starter && bench);
  assert.equal(starter.statistics.minutes, 60);
  assert.equal(starter.statistics.goals, 1);
  assert.equal(starter.statistics.concededWhileOnPitch, null);
  assert.equal(starter.statistics.savesIncludingPenalties, null);
  assert.equal(starter.statistics.penaltySaves, null);
  assert.equal(starter.discipline, null);
  assert.equal(bench.statistics.minutes, null);
  assert.equal(bench.statistics.goals, null);
  assert.equal(draft.mappings.length, 6);
  assert.ok(draft.issues.includes('aggregate-values-missing'));
});
void test('provider draft rejects cross-fixture parameters, incomplete pages, duplicate players and retired mappings', () => {
  const f = normalizationFixture();
  const parse = (sources: typeof f.sources, mappings = f.mappings) =>
    parseProviderMatch(f.fixture, f.binding, mappings, sources);
  assert.throws(
    () =>
      parse({
        ...f.sources,
        events: {
          ...f.sources.events,
          payload: {
            ...f.sources.events.payload,
            parameters: { fixture: '9999' },
          },
        },
      }),
    CommandRejected,
  );
  assert.throws(
    () =>
      parse({
        ...f.sources,
        players: {
          ...f.sources.players,
          payload: {
            ...f.sources.players.payload,
            paging: { current: 1, total: 2 },
          },
        },
      }),
    CommandRejected,
  );
  assert.throws(
    () =>
      parse(
        f.sources,
        f.mappings.map((m) =>
          m.kind === 'footballer' ? { ...m, state: 'retired' as const } : m,
        ),
      ),
    CommandRejected,
  );
  const lineup = {
    team: { id: 7001 },
    startXI: [{ player: { id: 8001 } }, { player: { id: 8001 } }],
    substitutes: [],
  };
  assert.throws(
    () =>
      parse({
        ...f.sources,
        lineups: {
          ...f.sources.lineups,
          payload: {
            ...f.sources.lineups.payload,
            response: [lineup, f.sources.lineups.payload.response[1]],
          },
        },
      }),
    CommandRejected,
  );
});
void test('shootout or replay statuses cannot be silently normalized as an ordinary completed match', () => {
  const f = normalizationFixture();
  for (const status of ['PEN', 'AET', 'AWD', 'ABD', 'P', 'UNKNOWN']) {
    const sources = {
      ...f.sources,
      fixtures: {
        ...f.sources.fixtures,
        payload: {
          ...f.sources.fixtures.payload,
          response: [
            {
              fixture: {
                id: 9001,
                date: f.fixture.kickoff,
                status: { short: status },
              },
              league: { id: 900028, season: 2026 },
              teams: { home: { id: 7001 }, away: { id: 7002 } },
              goals: { home: 1, away: 0 },
            },
          ],
        },
      },
    };
    assert.throws(
      () => parseProviderMatch(f.fixture, f.binding, f.mappings, sources),
      (e) =>
        e instanceof CommandRejected &&
        e.code === 'normalization-status-needs-review',
    );
  }
});

void test('complete reviewed draft derives substitution, own-goal and penalty facts while keeping acceptance gated', () => {
  const f = providerTimelineFixture();
  const result = parseProviderMatch(
    f.fixture,
    f.binding,
    f.mappings,
    f.sources,
  );
  const find = (id: number) => {
    const row = result.observation.performances.find(
      (p) => p.footballerId === f.identities.get(id),
    );
    assert.ok(row);
    return row;
  };
  assert.equal(find(8003).statistics.minutes, 60);
  assert.equal(find(8003).statistics.ownGoals, 1);
  assert.equal(find(8003).statistics.concededWhileOnPitch, 2);
  assert.equal(find(8003).statistics.concededAfterDismissal, 0);
  assert.equal(find(8024).statistics.concededWhileOnPitch, 1);
  assert.equal(find(8001).statistics.penaltyMisses, 1);
  assert.equal(find(8014).statistics.penaltySaves, 1);
  assert.equal(find(8014).statistics.savesIncludingPenalties, 2);
  assert.deepEqual(find(8014).discipline, { kind: 'none' });
  assert.equal(find(8002).statistics.minutes, null);
  assert.equal(result.observation.fixture.factsComplete, false);
  assert.equal(result.observation.eligibilityComplete, false);
  assert.equal(
    result.issues.some((issue) => issue.startsWith('timeline-')),
    false,
  );
});
void test('missing and inconsistent penalty/save aggregates remain unknown in the review draft', () => {
  for (const options of [
    { saves: null },
    { saved: null },
    { saves: 0, saved: 1 },
    { saves: 4, saved: 2 },
  ]) {
    const f = providerTimelineFixture(options);
    const result = parseProviderMatch(
      f.fixture,
      f.binding,
      f.mappings,
      f.sources,
    );
    const keeper = result.observation.performances.find(
      (p) => p.footballerId === f.identities.get(8014),
    );
    assert.ok(keeper);
    assert.equal(keeper.statistics.penaltySaves, null);
    assert.equal(keeper.statistics.savesIncludingPenalties, null);
  }
  for (const missed of [null, 0, 2]) {
    const f = providerTimelineFixture({ missed });
    const result = parseProviderMatch(
      f.fixture,
      f.binding,
      f.mappings,
      f.sources,
    );
    const player = result.observation.performances.find(
      (p) => p.footballerId === f.identities.get(8001),
    );
    assert.ok(player);
    assert.equal(player.statistics.penaltyMisses, null);
  }
});
void test('multiple goalkeeper reports cannot claim more penalty saves than the opposing misses', () => {
  const f = providerTimelineFixture();
  const away = f.sources.players.payload.response.find(
    (team) => team.team.id === 7002,
  );
  assert.ok(away);
  const second = away.players.find((row) => row.player.id === 8024)
    ?.statistics[0];
  assert.ok(second);
  second.games.position = 'G';
  second.goals.saves = 1;
  second.penalty.saved = 1;
  const result = parseProviderMatch(
    f.fixture,
    f.binding,
    f.mappings,
    f.sources,
  );
  for (const id of [8014, 8024]) {
    const keeper = result.observation.performances.find(
      (p) => p.footballerId === f.identities.get(id),
    );
    assert.ok(keeper);
    assert.equal(keeper.statistics.penaltySaves, null);
  }
});
void test('equal roster and statistics counts cannot hide a one-for-one player identity mismatch', () => {
  const f = providerTimelineFixture();
  const team = f.sources.players.payload.response[0];
  const row = team?.players[0];
  assert.ok(team && row);
  const originalCount = team.players.length;
  row.player.id = 999999;
  assert.equal(team.players.length, originalCount);
  assert.throws(
    () => parseProviderMatch(f.fixture, f.binding, f.mappings, f.sources),
    (error: unknown) =>
      error instanceof CommandRejected &&
      error.code === 'normalization-lineup-conflict',
  );
});
void test('missing goal aggregates are recovered from reconciled goal events, never from a null-to-zero default', () => {
  const f = providerTimelineFixture();
  const sources = {
    ...f.sources,
    players: {
      ...f.sources.players,
      payload: {
        ...f.sources.players.payload,
        response: f.sources.players.payload.response.map((team) => ({
          ...team,
          players: team.players.map((row) => ({
            ...row,
            statistics: row.statistics.map((stats) => ({
              ...stats,
              goals: { ...stats.goals, total: null },
            })),
          })),
        })),
      },
    },
  };
  const result = parseProviderMatch(f.fixture, f.binding, f.mappings, sources);
  const scorer = result.observation.performances.find(
    (p) => p.footballerId === f.identities.get(8001),
  );
  const defender = result.observation.performances.find(
    (p) => p.footballerId === f.identities.get(8003),
  );
  assert.ok(scorer && defender);
  assert.equal(scorer.statistics.goals, 2);
  assert.equal(defender.statistics.goals, 0);
  const incomplete = {
    ...sources,
    events: {
      ...sources.events,
      payload: { ...sources.events.payload, response: [], results: 0 },
    },
  };
  const held = parseProviderMatch(f.fixture, f.binding, f.mappings, incomplete);
  assert.ok(held.issues.includes('timeline-score-conflict'));
  assert.equal(
    held.observation.performances.find(
      (p) => p.footballerId === f.identities.get(8001),
    )?.statistics.goals,
    null,
  );
});
