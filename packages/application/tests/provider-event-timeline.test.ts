import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveProviderTimeline,
  type TimelineEvent,
  type TimelinePlayer,
} from '../src/provider-event-timeline.ts';

function fixture(events: readonly TimelineEvent[] = []) {
  return {
    home: 1,
    away: 2,
    homeGoals: 0,
    awayGoals: 0,
    events,
    players: Array.from({ length: 24 }, (_, i): TimelinePlayer => {
      const id = i + 1,
        starter = id <= 22;
      return {
        id,
        teamId: id <= 11 || id === 23 ? 1 : 2,
        starter,
        minutes: starter ? 90 : null,
        goals: starter ? 0 : null,
        yellow: starter ? 0 : null,
        red: starter ? 0 : null,
      };
    }),
  };
}
function player(
  f: ReturnType<typeof fixture>,
  id: number,
  patch: Partial<TimelinePlayer>,
) {
  f.players = f.players.map((p) => (p.id === id ? { ...p, ...patch } : p));
}
const goal = (
  team: number,
  id: number,
  minute: number,
  detail = 'Normal Goal',
  extra = 0,
): TimelineEvent => ({
  team: { id: team },
  player: { id },
  type: 'Goal',
  detail,
  time: { elapsed: minute, extra },
});
const card = (id: number, minute: number, detail: string): TimelineEvent => ({
  team: { id: 2 },
  player: { id },
  type: 'Card',
  detail,
  time: { elapsed: minute },
});
const sub = (
  out: number,
  incoming: number,
  minute: number,
  extra = 0,
): TimelineEvent => ({
  team: { id: 2 },
  player: { id: out },
  assist: { id: incoming },
  type: 'subst',
  detail: 'Substitution 1',
  time: { elapsed: minute, extra },
});

void test('complete scoreless regulation evidence establishes clean-sheet inputs without inventing unused bench minutes', () => {
  const result = deriveProviderTimeline(fixture());
  assert.deepEqual(result.issues, []);
  assert.equal(result.facts.size, 22);
  assert.equal(result.facts.get(12)?.concededWhileOnPitch, 0);
  assert.deepEqual(result.facts.get(12)?.discipline, { kind: 'none' });
  assert.equal(result.facts.has(24), false);
});
for (const minute of [59, 60]) {
  void test(`substitution at ${String(minute)} preserves exact reported minutes and excludes later conceded goals`, () => {
    const f = fixture([sub(12, 24, minute), goal(1, 1, 70)]);
    f.homeGoals = 1;
    player(f, 1, { goals: 1 });
    player(f, 12, { minutes: minute });
    player(f, 24, { minutes: 90 - minute, goals: 0, yellow: 0, red: 0 });
    const result = deriveProviderTimeline(f);
    assert.deepEqual(result.issues, []);
    assert.equal(result.facts.get(12)?.concededWhileOnPitch, 0);
    assert.equal(result.facts.get(24)?.concededWhileOnPitch, 1);
    assert.equal(result.facts.get(13)?.concededWhileOnPitch, 1);
  });
}
void test('full-time stoppage goals count and first-half stoppage sorts before second-half play', () => {
  const f = fixture([
    goal(1, 1, 90, 'Normal Goal', 5),
    sub(12, 24, 46),
    goal(1, 1, 45, 'Normal Goal', 5),
  ]);
  f.homeGoals = 2;
  player(f, 1, { goals: 2 });
  player(f, 12, { minutes: 46 });
  player(f, 24, { minutes: 44, goals: 0, yellow: 0, red: 0 });
  const result = deriveProviderTimeline(f);
  assert.deepEqual(result.issues, []);
  assert.equal(result.facts.get(12)?.concededWhileOnPitch, 1);
  assert.equal(result.facts.get(24)?.concededWhileOnPitch, 1);
});
for (const priorYellow of [false, true]) {
  void test(`straight red preserves prior yellow=${String(priorYellow)} and tracks later conceded goals`, () => {
    const f = fixture([
      ...(priorYellow ? [card(12, 10, 'Yellow Card')] : []),
      goal(1, 1, 20),
      card(12, 40, 'Red Card'),
      goal(1, 1, 60),
    ]);
    f.homeGoals = 2;
    player(f, 1, { goals: 2 });
    player(f, 12, { minutes: 40, yellow: priorYellow ? 1 : 0, red: 1 });
    const result = deriveProviderTimeline(f);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.facts.get(12)?.discipline, {
      kind: 'straight-red',
      priorYellow,
    });
    assert.equal(result.facts.get(12)?.concededWhileOnPitch, 1);
    assert.equal(result.facts.get(12)?.concededAfterDismissal, 1);
    assert.equal(result.facts.get(13)?.concededWhileOnPitch, 2);
  });
}
for (const paired of [false, true]) {
  void test(`explicit second yellow handles a paired yellow event=${String(paired)}`, () => {
    const f = fixture([
      card(12, 10, 'Yellow Card'),
      ...(paired ? [card(12, 40, 'Yellow Card')] : []),
      card(12, 40, 'Yellow-Red Card'),
      goal(1, 1, 60),
    ]);
    f.homeGoals = 1;
    player(f, 1, { goals: 1 });
    player(f, 12, { minutes: 40, yellow: 2, red: 1 });
    const result = deriveProviderTimeline(f);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.facts.get(12)?.discipline, {
      kind: 'second-yellow',
    });
    assert.equal(result.facts.get(12)?.concededAfterDismissal, 1);
  });
}
void test('own goals credit the opposing score and the actor own-goal count; missed penalties do not increase score', () => {
  const f = fixture([
    goal(1, 12, 20, 'Own Goal'),
    goal(1, 1, 30, 'Missed Penalty'),
    goal(1, 1, 40, 'Penalty'),
  ]);
  f.homeGoals = 2;
  player(f, 1, { goals: 1 });
  const result = deriveProviderTimeline(f);
  assert.deepEqual(result.issues, []);
  assert.equal(result.facts.get(12)?.ownGoals, 1);
  assert.equal(result.facts.get(12)?.concededWhileOnPitch, 2);
  assert.equal(result.facts.get(1)?.penaltyMisses, 1);
});
for (const change of [sub(12, 24, 60), card(12, 60, 'Red Card')]) {
  for (const reverse of [false, true]) {
    void test(`a same-minute goal/${change.type} tie is held regardless of payload order=${String(reverse)}`, () => {
      const events = [goal(1, 1, 60), change];
      const f = fixture(reverse ? events.reverse() : events);
      f.homeGoals = 1;
      const result = deriveProviderTimeline(f);
      assert.deepEqual(result.issues, ['timeline-event-ambiguous']);
      assert.equal(result.facts.size, 0);
    });
  }
}
void test('duplicate and VAR events cannot silently rewrite a timeline', () => {
  for (const events of [
    [goal(1, 1, 20), goal(1, 1, 20)],
    [{ ...goal(1, 1, 20), type: 'Var', detail: 'Goal cancelled' }],
  ]) {
    const result = deriveProviderTimeline(fixture(events));
    assert.deepEqual(result.issues, ['timeline-event-ambiguous']);
    assert.equal(result.facts.size, 0);
  }
});
void test('shootout, missing clocks and invalid stoppage clocks remain review cases', () => {
  for (const event of [
    goal(1, 1, 120, 'Penalty'),
    { ...goal(1, 1, 20), time: undefined },
    goal(1, 1, 30, 'Normal Goal', 4),
  ]) {
    const result = deriveProviderTimeline(fixture([event]));
    assert.deepEqual(result.issues, ['timeline-time-missing']);
    assert.equal(result.facts.size, 0);
  }
});
void test('score mismatch, missing statistics and contradictory participation never yield defensive facts', () => {
  const score = fixture();
  score.homeGoals = 1;
  const minutes = fixture();
  player(minutes, 12, { minutes: null });
  const missingSub = fixture();
  player(missingSub, 12, { minutes: 60 });
  const conflictingGoal = fixture();
  player(conflictingGoal, 12, { goals: 1 });
  const invisibleReserve = fixture();
  player(invisibleReserve, 24, { minutes: 10 });
  for (const f of [
    score,
    minutes,
    missingSub,
    conflictingGoal,
    invisibleReserve,
  ]) {
    const result = deriveProviderTimeline(f);
    assert.equal(result.facts.size, 0);
    assert.ok(result.issues.length);
  }
});
void test('unknown players, cross-team substitutions, re-entry and post-dismissal goals remain held', () => {
  for (const events of [
    [goal(1, 999, 20)],
    [sub(12, 23, 20)],
    [sub(12, 24, 20), sub(24, 12, 30)],
    [card(12, 20, 'Red Card'), goal(2, 12, 30)],
  ]) {
    const result = deriveProviderTimeline(fixture(events));
    assert.equal(result.facts.size, 0);
    assert.ok(result.issues.length);
  }
});
void test('duplicate, incomplete or third-team lineups cannot establish complete participation', () => {
  const incomplete = fixture();
  incomplete.players = incomplete.players.slice(1);
  const duplicate = fixture();
  const first = duplicate.players[0];
  assert.ok(first);
  duplicate.players = [...duplicate.players, first];
  const foreign = fixture();
  player(foreign, 12, { teamId: 99 });
  for (const f of [incomplete, duplicate, foreign])
    assert.deepEqual(deriveProviderTimeline(f).issues, [
      'timeline-lineup-incomplete',
    ]);
});
void test('card aggregate disagreement is visible and never establishes a disciplinary decision', () => {
  const f = fixture();
  player(f, 12, { red: 1 });
  const result = deriveProviderTimeline(f);
  assert.deepEqual(result.issues, ['timeline-cards-conflict']);
  assert.equal(result.facts.size, 0);
});

void test('a missing yellow count with known no dismissal withholds only the affected player', () => {
  const f = fixture();
  player(f, 12, { yellow: null });
  const result = deriveProviderTimeline(f);
  assert.deepEqual(result.issues, ['timeline-cards-conflict']);
  assert.equal(result.facts.has(12), false);
  assert.equal(result.facts.get(13)?.concededWhileOnPitch, 0);
});
