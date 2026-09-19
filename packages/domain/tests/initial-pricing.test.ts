import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  suggestInitialPrices,
  type InitialPriceCandidate,
  type InitialPricePolicy,
} from '../src/initial-pricing.ts';
import { fantasyTicks } from '../src/quantities.ts';
const bounds = { minimum: fantasyTicks(30), maximum: fantasyTicks(150) },
  policy: InitialPricePolicy = {
    currency: 'EUR',
    staleDays: 90,
    bounds: { GK: bounds, DEF: bounds, MID: bounds, FWD: bounds },
  },
  now = new Date('2026-09-19T00:00:00Z');
const candidate = (
  id: string,
  value: number,
  extra: Partial<InitialPriceCandidate> = {},
): InitialPriceCandidate => ({
  footballerId: id,
  position: 'MID',
  valuation: {
    amountMinor: value,
    currency: 'EUR',
    asOf: '2026-09-18T00:00:00Z',
    licensedForDisplay: true,
  },
  ...extra,
});
void test('initial prices use equal-value midranks within fantasy position and ignore input ordering', () => {
  const data = [
    candidate('a', 100),
    candidate('b', 200),
    candidate('c', 200),
    candidate('d', 400),
    candidate('e', 900, { position: 'GK' }),
  ];
  const result = suggestInitialPrices(data, policy, now);
  assert.deepEqual(
    result.map((p) => p.price),
    [30, 90, 90, 150, 90],
  );
  assert.equal(result[0]?.comparableCount, 4);
  assert.equal(result[4]?.comparableCount, 1);
  assert.deepEqual(
    suggestInitialPrices([...data].reverse(), policy, now),
    [...result].reverse(),
  );
  assert.deepEqual(
    suggestInitialPrices(
      [candidate('a', 100), candidate('b', 100)],
      policy,
      now,
    ).map((p) => p.price),
    [90, 90],
  );
});
void test('initial prices round half ticks upward exactly, including a single observation', () => {
  const narrow = {
    ...policy,
    bounds: {
      ...policy.bounds,
      MID: { minimum: fantasyTicks(30), maximum: fantasyTicks(31) },
    },
  };
  assert.equal(
    suggestInitialPrices([candidate('one', 1)], narrow, now)[0]?.price,
    31,
  );
  assert.deepEqual(
    suggestInitialPrices(
      [candidate('a', 1), candidate('b', 2), candidate('c', 3)],
      narrow,
      now,
    ).map((p) => p.price),
    [30, 31, 31],
  );
});
void test('missing, stale, future, incomparable and unlicensed valuations produce no guess', () => {
  const base = candidate('base', 100).valuation;
  assert.ok(base);
  const data = [
    candidate('missing', 1, { valuation: null }),
    candidate('old', 1, {
      valuation: { ...base, asOf: '2026-01-01T00:00:00Z' },
    }),
    candidate('future', 1, {
      valuation: { ...base, asOf: '2026-09-20T00:00:00Z' },
    }),
    candidate('other', 1, { valuation: { ...base, currency: 'USD' } }),
    candidate('rights', 1, {
      valuation: { ...base, licensedForDisplay: false },
    }),
    candidate('invalid', 1, { valuation: { ...base, amountMinor: 0.5 } }),
  ];
  const results = suggestInitialPrices(data, policy, now);
  assert.ok(results.every((r) => r.price === null));
  assert.deepEqual(
    results.map((r) => r.reason),
    [
      'missing-valuation',
      'stale-valuation',
      'future-valuation',
      'different-currency',
      'display-rights-unverified',
      'invalid-valuation',
    ],
  );
  assert.deepEqual(suggestInitialPrices([], policy, now), []);
});
void test('the stale cutoff is inclusive and malformed policies and duplicate identities fail', () => {
  const c = candidate('x', 0);
  assert.ok(c.valuation);
  const boundary = {
    ...c,
    valuation: {
      ...c.valuation,
      asOf: new Date(now.getTime() - 90 * 86400000).toISOString(),
    },
  };
  assert.equal(
    suggestInitialPrices([boundary], policy, now)[0]?.reason,
    'suggested',
  );
  assert.throws(() => suggestInitialPrices([c, c], policy, now), RangeError);
  assert.throws(
    () => suggestInitialPrices([c], { ...policy, staleDays: 0 }, now),
    RangeError,
  );
  assert.throws(
    () =>
      suggestInitialPrices(
        [c],
        {
          ...policy,
          bounds: {
            ...policy.bounds,
            MID: { minimum: fantasyTicks(50), maximum: fantasyTicks(30) },
          },
        },
        now,
      ),
    RangeError,
  );
});
