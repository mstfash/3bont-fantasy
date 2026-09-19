import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLASSIC_SQUAD_RULES,
  POSITIONS,
  fantasyTicks,
  pointUnits,
  scoreGameweek,
  type GameweekFootballer,
  type LockedEntry,
} from '../src/index.ts';

function fixture(): { locked: LockedEntry; players: GameweekFootballer[] } {
  const players = POSITIONS.flatMap((position) =>
    Array.from({ length: CLASSIC_SQUAD_RULES.quotas[position] }, (_, i) => ({
      footballerId: `${position}${String(i)}`,
      position,
      minutes: 90,
      points: pointUnits(2000),
    })),
  );
  return {
    players,
    locked: {
      roster: {
        holdings: players.map((p) => ({
          footballerId: p.footballerId,
          purchasePrice: fantasyTicks(50),
        })),
        bank: fantasyTicks(250),
        starterIds: [
          'GK0',
          'DEF0',
          'DEF1',
          'DEF2',
          'MID0',
          'MID1',
          'MID2',
          'MID3',
          'FWD0',
          'FWD1',
          'FWD2',
        ],
        reserveIds: ['GK1', 'MID4', 'DEF3', 'DEF4'],
        captaincy: { captainId: 'FWD0', viceCaptainId: 'MID0' },
      },
      chip: null,
      transferDeduction: pointUnits(0),
    },
  };
}

void test('captain keeps negative points after any participation; triple captain is 3x total', () => {
  const { locked, players } = fixture();
  const facts = players.map((p) =>
    p.footballerId === 'FWD0'
      ? { ...p, minutes: 1, points: pointUnits(-3000) }
      : p,
  );
  const scored = scoreGameweek(
    { ...locked, chip: 'triple-captain', transferDeduction: pointUnits(4000) },
    facts,
    CLASSIC_SQUAD_RULES,
  );
  assert.equal(scored.status, 'scored');
  assert.equal(scored.captainId, 'FWD0');
  assert.equal(scored.captainExtra, -6000);
  assert.equal(scored.total, 7000);
  assert.deepEqual(scored.substitutions, []);
});

void test('vice inherits multiplier only for confirmed captain absence; substitutes are not captains', () => {
  const { locked, players } = fixture();
  const facts = players.map((p) =>
    p.footballerId === 'FWD0' ? { ...p, minutes: 0, points: pointUnits(0) } : p,
  );
  const scored = scoreGameweek(locked, facts, CLASSIC_SQUAD_RULES);
  assert.equal(scored.status, 'scored');
  assert.equal(scored.captainId, 'MID0');
  assert.deepEqual(scored.substitutions, [{ in: 'MID4', out: 'FWD0' }]);
  assert.equal(scored.total, 24000);
});

void test('substitution search preserves final formation and prioritizes earlier bench players', () => {
  const { locked, players } = fixture();
  const facts = players.map((p) =>
    ['DEF0', 'FWD0'].includes(p.footballerId)
      ? { ...p, minutes: 0, points: pointUnits(0) }
      : p,
  );
  const scored = scoreGameweek(locked, facts, CLASSIC_SQUAD_RULES);
  assert.equal(scored.status, 'scored');
  assert.deepEqual(scored.substitutions, [
    { in: 'MID4', out: 'DEF0' },
    { in: 'DEF3', out: 'FWD0' },
  ]);
  assert.equal(scored.effectiveIds.includes('DEF4'), false);
});

void test('a midfielder cannot replace the only absent defender when it violates the minimum', () => {
  const { locked, players } = fixture();
  const facts = players.map((p) =>
    p.footballerId === 'DEF0' ? { ...p, minutes: 0, points: pointUnits(0) } : p,
  );
  const scored = scoreGameweek(locked, facts, CLASSIC_SQUAD_RULES);
  assert.equal(scored.status, 'scored');
  assert.deepEqual(scored.substitutions, [{ in: 'DEF3', out: 'DEF0' }]);
});

void test('reserve goalkeeper only replaces goalkeeper; Bench Boost counts every holding once', () => {
  const { locked, players } = fixture();
  const facts = players.map((p) =>
    p.footballerId === 'GK0' ? { ...p, minutes: 0, points: pointUnits(0) } : p,
  );
  const ordinary = scoreGameweek(locked, facts, CLASSIC_SQUAD_RULES);
  assert.equal(ordinary.status, 'scored');
  assert.deepEqual(ordinary.substitutions, [{ in: 'GK1', out: 'GK0' }]);
  const boost = scoreGameweek(
    { ...locked, chip: 'bench-boost' },
    facts,
    CLASSIC_SQUAD_RULES,
  );
  assert.equal(boost.status, 'scored');
  assert.equal(boost.effectiveIds.length, 15);
  assert.equal(boost.total, 30000);
  assert.deepEqual(boost.substitutions, []);
});

void test('unknown minutes block publication, rather than triggering substitutions or vice captain', () => {
  const { locked, players } = fixture();
  assert.deepEqual(
    scoreGameweek(
      locked,
      players.map((p) =>
        p.footballerId === 'FWD0' ? { ...p, minutes: null } : p,
      ),
      CLASSIC_SQUAD_RULES,
    ),
    { status: 'blocked', reason: 'unresolved-participation' },
  );
});

void test('live points do not replace absent starters or assign the vice-captain multiplier', () => {
  const { locked, players } = fixture();
  const pending = players.map((p) =>
    p.footballerId === 'FWD0'
      ? { ...p, minutes: null, points: pointUnits(0) }
      : p,
  );
  const live = scoreGameweek(
    locked,
    pending,
    CLASSIC_SQUAD_RULES,
    undefined,
    'live',
  );
  assert.equal(live.status, 'scored');
  assert.equal(live.captainId, null);
  assert.deepEqual(live.substitutions, []);
  assert.equal(live.total, 20000);
  assert.equal(
    scoreGameweek(locked, pending, CLASSIC_SQUAD_RULES).status,
    'blocked',
  );
});
