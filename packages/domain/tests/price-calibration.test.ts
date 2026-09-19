import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calibratePrices,
  type CalibrationRound,
} from '../src/price-calibration.ts';
import { fantasyTicks, pointUnits } from '../src/quantities.ts';
import type { SquadRules } from '../src/squads.ts';
const squad: SquadRules = {
  squadSize: 2,
  starterCount: 2,
  quotas: { GK: 1, DEF: 1, MID: 0, FWD: 0 },
  formations: [{ GK: 1, DEF: 1, MID: 0, FWD: 0 }],
  startingBudget: fantasyTicks(100),
  clubCap: 1,
  captaincyEnabled: false,
};
const players = [
  {
    footballerId: 'gk',
    clubId: 'a',
    position: 'GK' as const,
    price: fantasyTicks(50),
    pinned: true,
    selectable: true,
  },
  {
    footballerId: 'def',
    clubId: 'b',
    position: 'DEF' as const,
    price: fantasyTicks(50),
    pinned: false,
    selectable: true,
  },
];
const policy = {
  minimum: fantasyTicks(30),
  maximum: fantasyTicks(150),
  step: fantasyTicks(2),
  observedGameweeks: 1,
  minimumMinutes: 60,
  riseAt: pointUnits(6000),
  fallAt: pointUnits(2000),
  freezeHours: 24,
};
const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
const round = (
  number: number,
  deadline: number,
  finalized: number | null,
): CalibrationRound => ({
  id: String(number),
  number,
  deadline: day(deadline),
  finalizedAt: finalized === null ? null : day(finalized),
  revision: finalized === null ? 0 : 1,
  observations:
    finalized === null
      ? []
      : players.map((p) => ({
          footballerId: p.footballerId,
          gameweekId: String(number),
          number,
          revision: 1,
          minutes: 90,
          points: pointUnits(7000),
        })),
});
void test('calibration preserves pins, measures exact legal affordability and never changes its inputs', () => {
  const before = JSON.stringify(players),
    result = calibratePrices(
      players,
      [round(1, 1, 2), round(2, 5, 6), round(3, 10, null)],
      squad,
      [{ label: 'one', rules: policy }],
      day(7),
    );
  assert.equal(result.baseline.minimumSquadTicks, '100');
  assert.equal(result.baseline.affordable, true);
  const candidate = result.results[0];
  assert.ok(candidate);
  assert.equal(candidate.batches.length, 2);
  assert.equal(candidate.final.minimumSquadTicks, '104');
  assert.equal(candidate.final.affordable, false);
  assert.equal(
    candidate.finalPrices.find((p) => p.footballerId === 'gk')?.price,
    50,
  );
  assert.equal(candidate.batches[0]?.holds.pinned, 1);
  assert.equal(JSON.stringify(players), before);
});
void test('exact freeze boundary defers and coalesces sources without repricing twice in one window', () => {
  const result = calibratePrices(
    players,
    [round(1, 1, 4), round(2, 5, 6), round(3, 10, null)],
    squad,
    [{ label: 'freeze', rules: policy }],
    day(7),
  ).results[0];
  assert.ok(result);
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0]?.at, day(5));
  assert.deepEqual(result.batches[0].sourceGameweekIds, ['1']);
  assert.deepEqual(result.deferredGameweekIds, ['2']);
  const coalesced = calibratePrices(
    players,
    [round(1, 1, 6), round(2, 5, 6), round(3, 10, null)],
    squad,
    [{ label: 'same instant', rules: policy }],
    day(7),
  ).results[0];
  assert.deepEqual(coalesced?.batches[0]?.sourceGameweekIds, ['1', '2']);
  assert.equal(coalesced.batches.length, 1);
});
void test('unfinished earlier rounds block later sources and final season results cannot invent a window', () => {
  const gap = calibratePrices(
    players,
    [round(1, 1, null), round(2, 5, 6), round(3, 10, null)],
    squad,
    [{ label: 'gap', rules: policy }],
    day(7),
  ).results[0];
  assert.equal(gap?.batches.length, 0);
  assert.deepEqual(gap.deferredGameweekIds, ['2']);
  const ended = calibratePrices(
    players,
    [round(1, 1, 2)],
    squad,
    [{ label: 'ended', rules: policy }],
    day(3),
  ).results[0];
  assert.equal(ended?.batches.length, 0);
  assert.deepEqual(ended.deferredGameweekIds, ['1']);
});
void test('missing minutes hold prices; missing eligibility observations are not invented as zero', () => {
  const source = round(1, 1, 2),
    unknown = {
      ...source,
      observations: source.observations.map((p) => ({ ...p, minutes: null })),
    };
  const a = calibratePrices(
    players,
    [unknown, round(2, 5, null)],
    squad,
    [{ label: 'unknown', rules: policy }],
    day(3),
  ).results[0];
  assert.equal(a?.batches[0]?.holds['incomplete-data'], 1);
  assert.equal(a.final.totalTicks, '100');
  const b = calibratePrices(
    players,
    [{ ...source, observations: [] }, round(2, 5, null)],
    squad,
    [{ label: 'absent', rules: policy }],
    day(3),
  ).results[0];
  assert.equal(b?.batches[0]?.holds['insufficient-history'], 1);
});
void test('candidate runs are independent, preserve club feasibility and reject invalid calendars or bounds', () => {
  const sources = [round(1, 1, 2), round(2, 5, null)];
  const results = calibratePrices(
    players,
    sources,
    squad,
    [
      { label: 'fast', rules: policy },
      { label: 'slow', rules: { ...policy, observedGameweeks: 2 } },
    ],
    day(3),
  ).results;
  assert.equal(results[0]?.final.totalTicks, '102');
  assert.equal(results[1]?.final.totalTicks, '100');
  const impossible = calibratePrices(
    players.map((p) => ({ ...p, clubId: 'a' })),
    sources,
    squad,
    [{ label: 'bad pool', rules: policy }],
    day(3),
  );
  assert.equal(impossible.baseline.minimumSquadTicks, null);
  assert.equal(impossible.baseline.affordable, false);
  assert.throws(
    () =>
      calibratePrices(
        players,
        [round(1, 5, 2)],
        squad,
        [{ label: 'bad time', rules: policy }],
        day(7),
      ),
    RangeError,
  );
  assert.throws(
    () =>
      calibratePrices(
        players,
        sources,
        squad,
        [{ label: 'bounds', rules: { ...policy, minimum: fantasyTicks(60) } }],
        day(3),
      ),
    RangeError,
  );
});
