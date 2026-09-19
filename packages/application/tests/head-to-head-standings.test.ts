import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeadToHeadEdition } from '@fantasy/contracts';
import { pointUnits } from '@fantasy/domain';
import {
  calculateHeadToHeadStandings,
  type HeadToHeadInputs,
} from '../src/head-to-head-standings.ts';
const edition: HeadToHeadEdition = {
  id: 'edition',
  groupId: 'group',
  competitionId: 'competition',
  name: 'Synthetic',
  status: 'published',
  revision: 1,
  gameweekIds: ['r1'],
  seed: 'a'.repeat(32),
  tieBreak: 'shared',
  tablePoints: { win: 5, draw: 2, loss: 1 },
  createdAt: '2026-01-01T00:00:00Z',
  publishedAt: '2026-01-01T00:00:00Z',
  schedule: [{ gameweekId: 'r1', homeId: 'a', awayId: 'b', cycle: 1 }],
};
function inputs(a: number | null = 10, b: number | null = 9): HeadToHeadInputs {
  return {
    registrations: ['a', 'b'].map((id) => ({ id, name: id, accountId: id })),
    rounds: [
      {
        id: 'r1',
        name: { en: 'Round', ar: 'جولة' },
        deadline: '2026-01-01T00:00:00Z',
        status: 'finalized',
        resultRevision: 1,
      },
    ],
    forfeits: [],
    scores: [
      ['a', a],
      ['b', b],
    ].flatMap(([id, value]) =>
      typeof id === 'string' && typeof value === 'number'
        ? [{ entryId: id, gameweekId: 'r1', total: pointUnits(value * 1000) }]
        : [],
    ),
  };
}
void test('a correction flips the matchup and configured table points without mutating the published inputs', () => {
  const source = inputs();
  const before = structuredClone(source);
  const original = calculateHeadToHeadStandings(edition, source);
  const changed = calculateHeadToHeadStandings(edition, inputs(8, 9));
  assert.equal(original.matches[0]?.outcome, 'home');
  assert.equal(changed.matches[0]?.outcome, 'away');
  assert.equal(changed.table[0]?.entryId, 'b');
  assert.equal(changed.table[0].tablePoints, 5);
  assert.equal(changed.table[1]?.tablePoints, 1);
  assert.deepEqual(source, before);
});
void test('ties share ranks; the configured fantasy-points tiebreak separates equal table points', () => {
  const tied = calculateHeadToHeadStandings(edition, inputs(10, 10));
  assert.deepEqual(
    tied.table.map((r) => [r.rank, r.tablePoints]),
    [
      [1, 2],
      [1, 2],
    ],
  );
  const source = inputs(10, 9);
  const both = {
    ...source,
    forfeits: ['a', 'b'].map((entryId) => ({ entryId, gameweekId: 'r1' })),
  };
  const ranked = calculateHeadToHeadStandings(
    { ...edition, tieBreak: 'fantasy-points' },
    both,
  );
  assert.deepEqual(
    ranked.table.map((r) => [r.rank, r.tablePoints, r.losses]),
    [
      [1, 0, 1],
      [2, 0, 1],
    ],
  );
});
void test('recorded forfeits override corrected fantasy scores, including a double forfeit', () => {
  const source = inputs(100, 9);
  const forfeits = [{ entryId: 'a', gameweekId: 'r1' }];
  assert.equal(
    calculateHeadToHeadStandings(edition, { ...source, forfeits }).matches[0]
      ?.outcome,
    'away',
  );
  forfeits.push({ entryId: 'b', gameweekId: 'r1' });
  const both = calculateHeadToHeadStandings(edition, { ...source, forfeits });
  assert.equal(both.matches[0]?.outcome, 'double-forfeit');
  assert.ok(both.table.every((r) => r.tablePoints === 0));
});
void test('byes award no table points or played match, while preserving fantasy totals', () => {
  const bye = calculateHeadToHeadStandings(
    {
      ...edition,
      schedule: [{ gameweekId: 'r1', homeId: 'a', awayId: null, cycle: 1 }],
    },
    inputs(),
  );
  assert.equal(bye.matches[0]?.outcome, 'bye');
  assert.equal(bye.table.find((r) => r.entryId === 'a')?.fantasyPoints, 10000);
  assert.ok(bye.table.every((r) => r.played === 0 && r.tablePoints === 0));
});
void test('missing results are unavailable, never zero-score wins; provisional results remain nonfinal', () => {
  const missing = calculateHeadToHeadStandings(edition, inputs(10, null));
  assert.equal(missing.matches[0]?.outcome, null);
  assert.ok(missing.table.every((r) => r.played === 0));
  const source = inputs(-1, -2);
  const provisional = calculateHeadToHeadStandings(edition, {
    ...source,
    rounds: source.rounds.map((r) => ({ ...r, status: 'provisional' })),
  });
  assert.equal(provisional.matches[0]?.outcome, 'home');
  assert.equal(provisional.matches[0].final, false);
  const unpublished = calculateHeadToHeadStandings(edition, {
    ...source,
    rounds: source.rounds.map((r) => ({ ...r, resultRevision: 0 })),
  });
  assert.equal(unpublished.matches[0]?.outcome, null);
});
