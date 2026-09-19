import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLASSIC_SQUAD_RULES,
  POSITIONS,
  fantasyPrice,
  validateInitialSquad,
  validateSquadRules,
} from '../src/index.ts';
import type { SquadSelection, SelectedFootballer } from '../src/index.ts';

function squad(): SquadSelection {
  const players: SelectedFootballer[] = [];
  for (const position of POSITIONS) {
    for (let n = 0; n < CLASSIC_SQUAD_RULES.quotas[position]; n++) {
      players.push({
        footballerId: `${position}${String(n)}`,
        clubId: `club${String(Math.floor(players.length / 3))}`,
        position,
        price: fantasyPrice('5'),
      });
    }
  }
  const starterIds = [
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
  ];
  return {
    players,
    starterIds,
    reserveIds: players
      .map((p) => p.footballerId)
      .filter((id) => !starterIds.includes(id)),
    captaincy: { captainId: 'FWD0', viceCaptainId: 'MID0' },
  };
}

void test('Q08: default complete squad and every permitted formation validate', () => {
  assert.deepEqual(validateSquadRules(CLASSIC_SQUAD_RULES), []);
  const original = squad();
  for (const formation of CLASSIC_SQUAD_RULES.formations) {
    const starterIds = POSITIONS.flatMap((position) =>
      original.players
        .filter((p) => p.position === position)
        .slice(0, formation[position])
        .map((p) => p.footballerId),
    );
    assert.deepEqual(
      validateInitialSquad(
        {
          ...original,
          starterIds,
          reserveIds: original.players
            .map((p) => p.footballerId)
            .filter((id) => !starterIds.includes(id)),
        },
        CLASSIC_SQUAD_RULES,
      ),
      [],
    );
  }
});

void test('invalid squad rejects duplicate identities, positional imbalance and club stacking', () => {
  const original = squad();
  const first = original.players[0];
  assert.ok(first);
  const players = original.players.map((p, index) =>
    index === 14 ? first : { ...p, clubId: 'one-club' },
  );
  const codes = validateInitialSquad(
    { ...original, players },
    CLASSIC_SQUAD_RULES,
  ).map((i) => i.code);
  assert.ok(codes.includes('duplicate-footballer'));
  assert.ok(codes.includes('position-quota'));
  assert.ok(codes.includes('club-cap'));
});

void test('initial budget is exact, including equality at the limit', () => {
  const original = squad();
  const exact = { ...CLASSIC_SQUAD_RULES, startingBudget: fantasyPrice('75') };
  assert.deepEqual(validateInitialSquad(original, exact), []);
  assert.ok(
    validateInitialSquad(original, {
      ...exact,
      startingBudget: fantasyPrice('74.9'),
    }).some((i) => i.code === 'over-budget'),
  );
});

void test('lineup and reserves must partition exactly the owned squad', () => {
  const original = squad();
  for (const selection of [
    { ...original, reserveIds: [...original.reserveIds, 'stranger'] },
    { ...original, reserveIds: ['GK0', ...original.reserveIds.slice(1)] },
    { ...original, starterIds: original.starterIds.slice(1) },
    {
      ...original,
      starterIds: original.starterIds.map((id) =>
        id === 'FWD2' ? 'stranger' : id,
      ),
    },
  ])
    assert.ok(
      validateInitialSquad(selection, CLASSIC_SQUAD_RULES).some(
        (i) => i.code === 'lineup-membership',
      ),
    );
});

void test('owned players can still form an illegal starting formation', () => {
  const original = squad();
  const starterIds = original.starterIds.map((id) =>
    id === 'DEF2' ? 'MID4' : id,
  );
  const reserveIds = original.reserveIds.map((id) =>
    id === 'MID4' ? 'DEF2' : id,
  );
  assert.ok(
    validateInitialSquad(
      { ...original, starterIds, reserveIds },
      CLASSIC_SQUAD_RULES,
    ).some((i) => i.code === 'formation'),
  );
});

void test('captain and vice must be distinct starters; disabled captaincy accepts neither', () => {
  const original = squad();
  for (const captaincy of [
    null,
    { captainId: 'GK1', viceCaptainId: 'MID0' },
    { captainId: 'MID0', viceCaptainId: 'MID0' },
  ]) {
    assert.ok(
      validateInitialSquad(
        { ...original, captaincy },
        CLASSIC_SQUAD_RULES,
      ).some((i) => i.code === 'captaincy'),
    );
  }
  assert.deepEqual(
    validateInitialSquad(
      { ...original, captaincy: null },
      { ...CLASSIC_SQUAD_RULES, captaincyEnabled: false },
    ),
    [],
  );
});

void test('Q08a: reject impossible templates before evaluating participant selections', () => {
  for (const rules of [
    { ...CLASSIC_SQUAD_RULES, squadSize: 14 },
    { ...CLASSIC_SQUAD_RULES, clubCap: 0 },
    { ...CLASSIC_SQUAD_RULES, starterCount: 16 },
    { ...CLASSIC_SQUAD_RULES, formations: [] },
    { ...CLASSIC_SQUAD_RULES, formations: [{ GK: 1, DEF: 6, MID: 3, FWD: 1 }] },
    { ...CLASSIC_SQUAD_RULES, quotas: { GK: 2, DEF: 5.5, MID: 4.5, FWD: 3 } },
  ]) {
    const issues = validateInitialSquad(squad(), rules);
    assert.ok(
      issues.length > 0 &&
        issues.every((i) => i.code === 'invalid-configuration'),
    );
  }
});

void test('configuration is honored rather than hardcoding a 15-player squad', () => {
  const selection = squad();
  const players = selection.players.filter((p) => p.footballerId !== 'FWD2');
  const starterIds = selection.starterIds.map((id) =>
    id === 'FWD2' ? 'MID4' : id,
  );
  assert.deepEqual(
    validateInitialSquad(
      {
        players,
        starterIds,
        reserveIds: players
          .map((p) => p.footballerId)
          .filter((id) => !starterIds.includes(id)),
        captaincy: selection.captaincy,
      },
      {
        ...CLASSIC_SQUAD_RULES,
        squadSize: 14,
        quotas: { ...CLASSIC_SQUAD_RULES.quotas, FWD: 2 },
        formations: [{ GK: 1, DEF: 3, MID: 5, FWD: 2 }],
      },
    ),
    [],
  );
});

void test('selection validation never mutates the supplied roster, ordering or rules', () => {
  const selection = squad();
  const before = JSON.stringify(selection);
  validateInitialSquad(selection, CLASSIC_SQUAD_RULES);
  assert.equal(JSON.stringify(selection), before);
  assert.ok(Object.isFrozen(CLASSIC_SQUAD_RULES.formations[0]));
});
