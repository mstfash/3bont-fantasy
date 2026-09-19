import assert from 'node:assert/strict';
import { test } from 'node:test';
import { achievementWitness } from '../src/achievements.ts';
import { pointUnits } from '../src/quantities.ts';
const round = (
  number: number,
  points: number | null,
  finalized = true,
  rank: number | null = 1,
) => ({
  number,
  points: points === null ? null : pointUnits(points),
  finalized,
  rank,
});
void test('achievement streaks use final consecutive declared rounds and break on unknown or insufficient scores', () => {
  const condition = {
    kind: 'streak' as const,
    length: 2,
    minimum: pointUnits(1),
  };
  assert.equal(
    achievementWitness(condition, 1, 10, 1, [
      round(1, 1000),
      round(2, null),
      round(3, 1000),
    ]),
    null,
  );
  assert.equal(
    achievementWitness(condition, 1, 10, 1, [
      round(1, 1000),
      round(2, 1000, false),
    ]),
    null,
  );
  assert.deepEqual(
    achievementWitness(condition, 1, 10, 1, [
      round(1, 1000),
      round(2, -1000),
      round(3, 1000),
      round(4, 2000),
    ]),
    [3, 4],
  );
  assert.deepEqual(
    achievementWitness(condition, 1, 10, 1, [round(1, 1000), round(3, 1000)]),
    [1, 3],
    'calendar numbers need not be contiguous',
  );
});
void test('achievement windows and entry eligibility apply to activations, thresholds and shared ranks', () => {
  assert.deepEqual(achievementWitness({ kind: 'activated' }, 2, 5, 2, []), []);
  assert.equal(achievementWitness({ kind: 'activated' }, 2, 5, 1, []), null);
  assert.deepEqual(
    achievementWitness({ kind: 'top-rank', maximumRank: 1 }, 1, 5, 2, [
      round(1, 9000),
      round(2, 3000, true, 1),
    ]),
    [2],
  );
  assert.equal(
    achievementWitness({ kind: 'positive-round' }, 1, 1, 1, [round(1, 0)]),
    null,
  );
  assert.deepEqual(
    achievementWitness(
      { kind: 'points', minimum: pointUnits(25000) },
      1,
      5,
      1,
      [round(1, 24000), round(2, 25000)],
    ),
    [2],
  );
});
