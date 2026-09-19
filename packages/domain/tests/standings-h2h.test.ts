import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocateCashPrizes,
  pointUnits,
  rankEntries,
  scheduleHeadToHead,
  scoreHeadToHead,
  type StandingInput,
} from '../src/index.ts';

function row(
  entryId: string,
  score: number,
  accountId = entryId,
): StandingInput {
  return {
    entryId,
    accountId,
    points: pointUnits(score * 1000),
    transferDeductions: pointUnits(0),
    effectiveGoals: 0,
  };
}

void test('shared ranks are 1,1,3; display identity never resolves sporting ties', () => {
  const rows = rankEntries([row('z', 100), row('a', 100), row('b', 90)]);
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 1, 3],
  );
  assert.deepEqual(
    rows.map((r) => r.entryId),
    ['a', 'z', 'b'],
  );
});

void test('optional tie breaks compare deductions then effective goals, preserving unresolved ties', () => {
  const inputs = [
    row('a', 100),
    { ...row('b', 100), effectiveGoals: 3 },
    { ...row('c', 100), effectiveGoals: 3 },
    {
      ...row('d', 100),
      effectiveGoals: 10,
      transferDeductions: pointUnits(4000),
    },
  ];
  assert.deepEqual(
    rankEntries(inputs, 'deductions-then-goals').map((r) => [
      r.entryId,
      r.rank,
    ]),
    [
      ['b', 1],
      ['c', 1],
      ['a', 3],
      ['d', 4],
    ],
  );
});

void test('cash prize ties pool occupied places and keep minor-unit remainder explicit', () => {
  const result = allocateCashPrizes(
    [row('a', 100), row('b', 100), row('c', 100), row('d', 90)],
    [10000, 5000, 1000, 500],
  );
  assert.deepEqual(
    result.awards.map((a) => a.amountMinor),
    [5333, 5333, 5333, 500],
  );
  assert.equal(result.remainderMinor, 1);
});

void test('one account gets its highest eligible entry; later accounts are not crowded out by extra squads', () => {
  const result = allocateCashPrizes(
    [row('a', 100, 'same'), row('b', 99, 'same'), row('c', 95, 'other')],
    [10000, 5000],
  );
  assert.deepEqual(
    result.awards.map((a) => [a.entryId, a.amountMinor]),
    [
      ['a', 10000],
      ['c', 5000],
    ],
  );
});

void test('H2H creates only complete cycles, with each pair once and equal byes for odd rosters', () => {
  for (const n of [2, 3, 4, 5, 8]) {
    const ids = Array.from({ length: n }, (_, i) => `entry-${String(i)}`);
    const rounds = n % 2 === 0 ? n - 1 : n;
    const weeks = Array.from(
      { length: rounds + 1 },
      (_, i) => `week-${String(i)}`,
    );
    const fixtures = scheduleHeadToHead(ids, weeks, 'published-seed-1');
    const cycles = Math.floor(weeks.length / rounds);
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const edition = fixtures.filter((f) => f.cycle === cycle);
      const pairs = edition
        .filter((f) => f.awayId !== null)
        .map((f) => [f.homeId, f.awayId].sort().join(':'));
      assert.equal(pairs.length, (n * (n - 1)) / 2);
      assert.equal(new Set(pairs).size, pairs.length);
      for (const id of ids)
        assert.equal(
          edition.filter((f) => f.homeId === id && f.awayId === null).length,
          n % 2,
        );
    }
    for (const week of weeks) {
      const playing = fixtures
        .filter((f) => f.gameweekId === week)
        .flatMap((f) =>
          f.awayId === null ? [f.homeId] : [f.homeId, f.awayId],
        );
      assert.equal(playing.length, new Set(playing).size);
    }
    assert.deepEqual(
      fixtures,
      scheduleHeadToHead([...ids].reverse(), weeks, 'published-seed-1'),
    );
  }
});

void test('H2H honors negative net points, draws, byes and double forfeits', () => {
  assert.deepEqual(scoreHeadToHead(pointUnits(-1000), pointUnits(-2000)), {
    home: 3,
    away: 0,
    outcome: 'home',
  });
  assert.deepEqual(scoreHeadToHead(pointUnits(0), pointUnits(0)), {
    home: 1,
    away: 1,
    outcome: 'draw',
  });
  assert.deepEqual(scoreHeadToHead(pointUnits(5000), null), {
    home: 0,
    away: 0,
    outcome: 'bye',
  });
  assert.deepEqual(
    scoreHeadToHead(pointUnits(5000), pointUnits(0), true, true),
    { home: 0, away: 0, outcome: 'double-forfeit' },
  );
});
