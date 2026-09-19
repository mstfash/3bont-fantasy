import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHIPS,
  CLASSIC_SQUAD_RULES,
  CLASSIC_TRANSFER_RULES,
  POSITIONS,
  activateChip,
  buildEntry,
  cancelChip,
  fantasyPrice,
  pointUnits,
  lockAndAdvance,
  transferBatch,
  transferDeduction,
  type EditingEntry,
  type SelectedFootballer,
  type SquadSelection,
} from '../src/index.ts';

const players: SelectedFootballer[] = POSITIONS.flatMap((position) =>
  Array.from({ length: CLASSIC_SQUAD_RULES.quotas[position] }, (_, i) => ({
    footballerId: `${position}${String(i)}`,
    clubId: `${position}${String(i)}`,
    position,
    price: fantasyPrice('5'),
  })),
);
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
const selection: SquadSelection = {
  players,
  starterIds,
  reserveIds: ['GK1', 'DEF3', 'DEF4', 'MID4'],
  captaincy: { captainId: 'FWD0', viceCaptainId: 'MID0' },
};
const initial = () =>
  buildEntry(selection, CLASSIC_SQUAD_RULES, {
    wildcard: 2,
    'free-hit': 2,
    'bench-boost': 1,
    'triple-captain': 1,
  });
const established = () =>
  lockAndAdvance(initial(), CLASSIC_TRANSFER_RULES).editing;
const extra: SelectedFootballer[] = [
  {
    footballerId: 'new-def',
    clubId: 'new',
    position: 'DEF',
    price: fantasyPrice('7.5'),
  },
  {
    footballerId: 'other-def',
    clubId: 'other',
    position: 'DEF',
    price: fantasyPrice('4'),
  },
];
const pool = [...players, ...extra];
function swap(
  entry: EditingEntry,
  out: string,
  incoming: string,
): EditingEntry {
  return transferBatch(
    entry,
    [{ out, in: incoming }],
    {
      starterIds: entry.roster.starterIds.map((id) =>
        id === out ? incoming : id,
      ),
      reserveIds: entry.roster.reserveIds.map((id) =>
        id === out ? incoming : id,
      ),
      captaincy: entry.roster.captaincy,
    },
    pool,
    CLASSIC_SQUAD_RULES,
    CLASSIC_TRANSFER_RULES,
  );
}

void test('first eligible round allows free construction and disallows restoration chips', () => {
  const entry = swap(swap(initial(), 'DEF0', 'new-def'), 'DEF1', 'other-def');
  assert.equal(transferDeduction(entry, CLASSIC_TRANSFER_RULES), 0);
  assert.throws(() => activateChip(entry, 'free-hit', CHIPS), /baseline/);
  assert.throws(() => activateChip(entry, 'wildcard', CHIPS), /baseline/);
  assert.equal(activateChip(entry, 'bench-boost', CHIPS).chip, 'bench-boost');
  assert.equal(
    lockAndAdvance(entry, CLASSIC_TRANSFER_RULES).editing.freeTransfers,
    1,
  );
});

void test('transfer reversal is another transfer; Wildcard cancellation restores normal costs', () => {
  const original = established();
  const changed = swap(swap(original, 'DEF0', 'new-def'), 'new-def', 'DEF0');
  assert.equal(changed.transfersThisRound, 2);
  assert.equal(transferDeduction(changed, CLASSIC_TRANSFER_RULES), 4000);
  const active = activateChip(changed, 'wildcard', CHIPS);
  assert.equal(transferDeduction(active, CLASSIC_TRANSFER_RULES), 0);
  assert.equal(
    transferDeduction(cancelChip(active), CLASSIC_TRANSFER_RULES),
    4000,
  );
  assert.deepEqual(cancelChip(active).roster, changed.roster);
});

void test('Free Hit cancellation restores pre-activation edits; locking restores prior permanent deadline', () => {
  const original = established();
  const changed = swap(original, 'DEF0', 'new-def');
  const active = swap(
    activateChip(changed, 'free-hit', CHIPS),
    'DEF1',
    'other-def',
  );
  const cancelled = cancelChip(active);
  assert.deepEqual(cancelled.roster, changed.roster);
  assert.equal(cancelled.transfersThisRound, 1);
  const result = lockAndAdvance(active, CLASSIC_TRANSFER_RULES);
  assert.deepEqual(result.locked.roster, active.roster);
  assert.deepEqual(result.editing.roster, original.roster);
  assert.equal(result.editing.inventory['free-hit'], 1);
  assert.equal(result.editing.freeTransfers, 2);
  assert.equal(result.locked.transferDeduction, 0);
});

void test('consecutive Free Hits retain permanent purchase prices and bank; saved transfers cap at five', () => {
  const original = { ...established(), freeTransfers: 4 };
  const first = lockAndAdvance(
    swap(activateChip(original, 'free-hit', CHIPS), 'DEF0', 'new-def'),
    CLASSIC_TRANSFER_RULES,
  ).editing;
  const second = lockAndAdvance(
    swap(activateChip(first, 'free-hit', CHIPS), 'DEF1', 'other-def'),
    CLASSIC_TRANSFER_RULES,
  ).editing;
  assert.deepEqual(second.roster, original.roster);
  assert.equal(second.freeTransfers, 5);
  assert.equal(second.inventory['free-hit'], 0);
  assert.throws(() => activateChip(second, 'free-hit', CHIPS), /unavailable/);
});

void test('chip cannot stack and cancellation does not consume inventory', () => {
  const entry = activateChip(established(), 'triple-captain', CHIPS);
  assert.throws(
    () => activateChip(entry, 'bench-boost', CHIPS),
    /already-active/,
  );
  assert.equal(cancelChip(entry).inventory['triple-captain'], 1);
  assert.equal(
    lockAndAdvance(entry, CLASSIC_TRANSFER_RULES).editing.inventory[
      'triple-captain'
    ],
    0,
  );
});

void test('transfer batch rejects overspending and positional corruption without changing the original', () => {
  const original = {
    ...established(),
    roster: { ...established().roster, bank: fantasyPrice('0') },
  };
  assert.throws(() => swap(original, 'DEF0', 'new-def'), /insufficient-bank/);
  assert.equal(original.roster.bank, 0);
  assert.throws(() => swap(established(), 'GK0', 'new-def'), /position-quota/);
});

void test('rollover charges the locked round policy but grants the incoming round allowance', () => {
  const entry = { ...established(), freeTransfers: 1, transfersThisRound: 2 };
  const result = lockAndAdvance(entry, CLASSIC_TRANSFER_RULES, {
    ...CLASSIC_TRANSFER_RULES,
    allowance: 2,
    carryCap: 3,
    extraTransferCost: pointUnits(8000),
  });
  assert.equal(result.locked.transferDeduction, 4000);
  assert.equal(result.editing.freeTransfers, 2);
});
