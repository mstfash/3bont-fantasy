import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fantasyPrice,
  fantasyTicks,
  points,
  pointUnits,
  sellingPrice,
  sumPoints,
  multiplyPoints,
} from '../src/index.ts';

void test('A14: half gains floor at a tenth; losses are realized in full', () => {
  for (const [purchase, current, expected] of [
    ['7.0', '7.5', '7.2'],
    ['7.0', '6.8', '6.8'],
    ['7.0', '7.1', '7.0'],
    ['7.0', '7.0', '7.0'],
    ['7.0', '7.2', '7.1'],
    ['0', '0.1', '0'],
  ] as const)
    assert.equal(
      sellingPrice(fantasyPrice(purchase), fantasyPrice(current)),
      fantasyPrice(expected),
    );
});

void test('A14: holdings of the same footballer retain distinct purchase costs', () => {
  assert.equal(
    sellingPrice(fantasyPrice('5.0'), fantasyPrice('7.0')),
    fantasyPrice('6.0'),
  );
  assert.equal(
    sellingPrice(fantasyPrice('6.0'), fantasyPrice('7.0')),
    fantasyPrice('6.5'),
  );
  assert.equal(
    sellingPrice(fantasyPrice('5.0'), fantasyPrice('7.0'), 'current-price'),
    fantasyPrice('7.0'),
  );
});

void test('sale invariant: price never exceeds current value; retained gain is nonnegative and at most half', () => {
  for (let bought = 0; bought <= 200; bought++) {
    for (let current = 0; current <= 200; current++) {
      const sale = sellingPrice(fantasyTicks(bought), fantasyTicks(current));
      assert.ok(sale >= 0 && sale <= current);
      if (current >= bought) {
        assert.ok(sale >= bought);
        assert.ok(2 * (sale - bought) <= current - bought);
        assert.ok(current - bought - 2 * (sale - bought) <= 1);
      } else assert.equal(sale, current);
    }
  }
});

void test('repeated immediate sell/rebuy cannot manufacture fantasy budget', () => {
  for (let bought = 30; bought < 100; bought++) {
    const current = fantasyTicks(100);
    const bankAfterCycle =
      sellingPrice(fantasyTicks(bought), current) - current;
    assert.ok(bankAfterCycle <= 0);
  }
});

void test('exact fractional points and price parsing without float rounding', () => {
  assert.equal(fantasyPrice('7.2'), 72);
  assert.equal(points('-0.125'), -125);
  assert.equal(sumPoints([points('0.1'), points('0.2')]), points('0.3'));
  assert.equal(multiplyPoints(points('-0.125'), 3), points('-0.375'));
  assert.equal(multiplyPoints(points('-1'), 0), 0);
  assert.equal(fantasyTicks(-0), 0);
});

void test('reject ambiguous, negative-money, nonfinite, overprecision and unsafe quantities', () => {
  for (const value of [
    '-1',
    '1.01',
    '1e2',
    ' 7.0',
    '1.',
    '.5',
    'NaN',
    'Infinity',
    '9007199254740992',
  ]) {
    assert.throws(() => fantasyPrice(value), RangeError);
  }
  assert.throws(() => points('0.0001'), RangeError);
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => fantasyTicks(value), RangeError);
  }
  assert.throws(
    () => multiplyPoints(pointUnits(Number.MAX_SAFE_INTEGER), 2),
    RangeError,
  );
  assert.throws(
    () => sumPoints([pointUnits(Number.MAX_SAFE_INTEGER), pointUnits(1)]),
    RangeError,
  );
});
