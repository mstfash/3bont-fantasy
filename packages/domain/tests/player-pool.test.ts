import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessPlayerPool } from '../src/player-pool.ts';
import { fantasyTicks } from '../src/quantities.ts';
import type { SelectedFootballer, SquadRules } from '../src/squads.ts';

const rules: SquadRules = {
  squadSize: 2,
  starterCount: 2,
  quotas: { GK: 1, DEF: 1, MID: 0, FWD: 0 },
  formations: [{ GK: 1, DEF: 1, MID: 0, FWD: 0 }],
  startingBudget: fantasyTicks(100),
  clubCap: 1,
  captaincyEnabled: false,
};
const player = (
  id: string,
  club: string,
  position: SelectedFootballer['position'],
  price: number,
): SelectedFootballer => ({
  footballerId: id,
  clubId: club,
  position,
  price: fantasyTicks(price),
});
void test('readiness can replace the cheapest early choice to satisfy club and position limits', () => {
  const outcome = assessPlayerPool(
    [
      player('cheap-gk', 'a', 'GK', 10),
      player('other-gk', 'b', 'GK', 30),
      player('only-def', 'a', 'DEF', 20),
    ],
    rules,
  );
  assert.ok(outcome.ready);
  assert.equal(outcome.minimumCost, 50n);
  assert.deepEqual(
    new Set(outcome.footballerIds),
    new Set(['other-gk', 'only-def']),
  );
});
void test('enough players still fail when positions, clubs or budget make a squad impossible', () => {
  assert.deepEqual(
    assessPlayerPool(
      [player('a', 'a', 'GK', 30), player('b', 'a', 'DEF', 30)],
      rules,
    ),
    { ready: false, reason: 'position-or-club-cap' },
  );
  assert.deepEqual(
    assessPlayerPool(
      [player('a', 'a', 'GK', 30), player('b', 'b', 'GK', 30)],
      rules,
    ),
    { ready: false, reason: 'position-or-club-cap' },
  );
  assert.deepEqual(
    assessPlayerPool(
      [player('a', 'a', 'GK', 70), player('b', 'b', 'DEF', 40)],
      rules,
    ),
    { ready: false, reason: 'over-budget' },
  );
});
void test('minimum-cost selection matches exhaustive search across small deterministic pools', () => {
  for (let trial = 0; trial < 100; trial++) {
    const players = Array.from({ length: 8 }, (_, i) =>
      player(
        String(i),
        String((i * 7 + trial) % 3),
        i % 2 === 0 ? 'GK' : 'DEF',
        (trial * 13 + i * 17) % 70,
      ),
    );
    const legalCosts = players
      .filter((p) => p.position === 'GK')
      .flatMap((gk) =>
        players
          .filter((p) => p.position === 'DEF' && p.clubId !== gk.clubId)
          .map((def) => gk.price + def.price),
      );
    const minimum = Math.min(...legalCosts);
    const result = assessPlayerPool(players, rules);
    if (minimum > rules.startingBudget) assert.equal(result.ready, false);
    else {
      assert.ok(result.ready);
      assert.equal(result.minimumCost, BigInt(minimum));
    }
  }
});
