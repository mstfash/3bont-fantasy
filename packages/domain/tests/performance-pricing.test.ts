import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proposePerformancePrice } from '../src/performance-pricing.ts';
import { fantasyTicks, pointUnits } from '../src/quantities.ts';
const rules = {
  minimum: fantasyTicks(30),
  maximum: fantasyTicks(150),
  step: fantasyTicks(1),
  observedGameweeks: 3,
  minimumMinutes: 90,
  riseAt: pointUnits(6000),
  fallAt: pointUnits(2000),
};
const history = (points: number[]) =>
  points.map((n, i) => ({
    gameweekId: String(i),
    number: i + 1,
    revision: 1,
    minutes: 90,
    points: pointUnits(n),
  }));
void test('repricing uses exact unmultiplied means and one bounded change', () => {
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([5000, 6000, 7000]),
      rules,
    ).newPrice,
    71,
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([5000, 6000, 6999]),
      rules,
    ).reason,
    'within-band',
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([0, 2000, 4000]),
      rules,
    ).newPrice,
    69,
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([100000, 100000, 100000, 100000]),
      rules,
    ).newPrice,
    71,
  );
});
void test('pins, unknown minutes, insufficient history/minutes and bounds hold prices', () => {
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      true,
      history([7000, 7000, 7000]),
      rules,
    ).reason,
    'pinned',
  );
  assert.equal(
    proposePerformancePrice(fantasyTicks(70), false, history([7000]), rules)
      .reason,
    'insufficient-history',
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([7000, 7000, 7000]).map((h) => ({ ...h, minutes: null })),
      rules,
    ).reason,
    'incomplete-data',
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(70),
      false,
      history([0, 0, 0]).map((h) => ({ ...h, minutes: 0 })),
      rules,
    ).reason,
    'insufficient-minutes',
  );
  assert.equal(
    proposePerformancePrice(
      fantasyTicks(150),
      false,
      history([7000, 7000, 7000]),
      rules,
    ).reason,
    'at-bound',
  );
  assert.equal(
    proposePerformancePrice(fantasyTicks(30), false, history([0, 0, 0]), rules)
      .reason,
    'at-bound',
  );
});
