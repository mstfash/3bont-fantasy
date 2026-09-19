import {
  fantasyTicks,
  multiplyPoints,
  pointUnits,
  type FantasyTicks,
  type PointUnits,
} from './quantities.ts';
import { sellingPrice, type SellingPricePolicy } from './prices.ts';
import {
  validateInitialSquad,
  type SelectedFootballer,
  type SquadRules,
  type SquadSelection,
} from './squads.ts';

export const CHIPS = [
  'wildcard',
  'free-hit',
  'bench-boost',
  'triple-captain',
] as const;
export type Chip = (typeof CHIPS)[number];
export type ChipInventory = Readonly<Record<Chip, number>>;

export interface Holding {
  readonly footballerId: string;
  readonly purchasePrice: FantasyTicks;
}

export interface EntryRoster {
  readonly holdings: readonly Holding[];
  readonly bank: FantasyTicks;
  readonly starterIds: readonly string[];
  readonly reserveIds: readonly string[];
  readonly captaincy: SquadSelection['captaincy'];
}

export interface EditingEntry {
  readonly roster: EntryRoster;
  /** The last permanent deadline roster, retained through consecutive Free Hits. */
  readonly permanentBaseline: EntryRoster | null;
  readonly freeTransfers: number;
  readonly transfersThisRound: number;
  readonly chip: Chip | null;
  readonly inventory: ChipInventory;
  readonly beforeFreeHit: {
    readonly roster: EntryRoster;
    readonly transfers: number;
  } | null;
}

export interface TransferRules {
  readonly allowance: number;
  readonly carryCap: number;
  readonly extraTransferCost: PointUnits;
  readonly sellingPolicy: SellingPricePolicy;
}

export const CLASSIC_TRANSFER_RULES: TransferRules = Object.freeze({
  allowance: 1,
  carryCap: 5,
  extraTransferCost: pointUnits(4000),
  sellingPolicy: 'half-gain-full-loss',
});

export class EntryRuleError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'EntryRuleError';
    this.code = code;
  }
}

function playerById(
  pool: readonly SelectedFootballer[],
  id: string,
): SelectedFootballer {
  const player = pool.find((p) => p.footballerId === id);
  if (!player) throw new EntryRuleError('footballer-not-in-pool');
  return player;
}

export function validateRoster(
  roster: EntryRoster,
  pool: readonly SelectedFootballer[],
  rules: SquadRules,
): void {
  const selection: SquadSelection = {
    ...roster,
    players: roster.holdings.map((h) => playerById(pool, h.footballerId)),
  };
  // Affordability is enforced by the bank ledger. Appreciated holdings are not limited to the initial budget.
  const issues = validateInitialSquad(selection, {
    ...rules,
    startingBudget: fantasyTicks(Number.MAX_SAFE_INTEGER),
  });
  if (issues.length > 0)
    throw new EntryRuleError(issues.map((i) => i.code).join(','));
  if (roster.bank < 0 || !Number.isSafeInteger(roster.bank))
    throw new EntryRuleError('insufficient-bank');
}

export function buildEntry(
  selection: SquadSelection,
  rules: SquadRules,
  inventory: ChipInventory,
): EditingEntry {
  const issues = validateInitialSquad(selection, rules);
  if (issues.length > 0)
    throw new EntryRuleError(issues.map((i) => i.code).join(','));
  if (
    CHIPS.some(
      (chip) => !Number.isSafeInteger(inventory[chip]) || inventory[chip] < 0,
    )
  )
    throw new EntryRuleError('invalid-chip-inventory');
  return {
    roster: {
      holdings: selection.players.map((p) => ({
        footballerId: p.footballerId,
        purchasePrice: p.price,
      })),
      bank: fantasyTicks(
        rules.startingBudget -
          selection.players.reduce((total, p) => total + p.price, 0),
      ),
      starterIds: [...selection.starterIds],
      reserveIds: [...selection.reserveIds],
      captaincy: selection.captaincy,
    },
    permanentBaseline: null,
    freeTransfers: 0,
    transfersThisRound: 0,
    chip: null,
    inventory: { ...inventory },
    beforeFreeHit: null,
  };
}

/** Caller supplies a complete post-transfer lineup, enabling atomic formation-changing batches. */
export function transferBatch(
  entry: EditingEntry,
  transfers: readonly { readonly out: string; readonly in: string }[],
  lineup: Pick<EntryRoster, 'starterIds' | 'reserveIds' | 'captaincy'>,
  pool: readonly SelectedFootballer[],
  squadRules: SquadRules,
  transferRules: TransferRules,
): EditingEntry {
  if (transfers.length === 0) throw new EntryRuleError('empty-transfer-batch');
  const outs = new Set(transfers.map((t) => t.out));
  const ins = new Set(transfers.map((t) => t.in));
  if (
    outs.size !== transfers.length ||
    ins.size !== transfers.length ||
    [...ins].some((id) => outs.has(id))
  )
    throw new EntryRuleError('duplicate-or-circular-transfer');
  let bank = BigInt(entry.roster.bank);
  for (const transfer of transfers) {
    const held = entry.roster.holdings.find(
      (h) => h.footballerId === transfer.out,
    );
    if (
      !held ||
      entry.roster.holdings.some((h) => h.footballerId === transfer.in)
    )
      throw new EntryRuleError('invalid-transfer-membership');
    bank += BigInt(
      sellingPrice(
        held.purchasePrice,
        playerById(pool, transfer.out).price,
        transferRules.sellingPolicy,
      ),
    );
    bank -= BigInt(playerById(pool, transfer.in).price);
  }
  if (bank < 0n || bank > BigInt(Number.MAX_SAFE_INTEGER))
    throw new EntryRuleError('insufficient-bank');
  const roster: EntryRoster = {
    ...lineup,
    bank: fantasyTicks(Number(bank)),
    holdings: [
      ...entry.roster.holdings.filter((h) => !outs.has(h.footballerId)),
      ...transfers.map((t) => ({
        footballerId: t.in,
        purchasePrice: playerById(pool, t.in).price,
      })),
    ],
  };
  validateRoster(roster, pool, squadRules);
  const transfersThisRound = entry.transfersThisRound + transfers.length;
  if (!Number.isSafeInteger(transfersThisRound))
    throw new EntryRuleError('transfer-count-overflow');
  return { ...entry, roster, transfersThisRound };
}

export function transferDeduction(
  entry: EditingEntry,
  rules: TransferRules,
): PointUnits {
  if (
    entry.permanentBaseline === null ||
    entry.chip === 'wildcard' ||
    entry.chip === 'free-hit'
  )
    return pointUnits(0);
  return multiplyPoints(
    rules.extraTransferCost,
    Math.max(0, entry.transfersThisRound - entry.freeTransfers),
  );
}

/** Available chips already incorporate the competition's enabled types and gameweek windows. */
export function activateChip(
  entry: EditingEntry,
  chip: Chip,
  available: readonly Chip[],
): EditingEntry {
  if (entry.chip !== null) throw new EntryRuleError('chip-already-active');
  if (!available.includes(chip) || entry.inventory[chip] < 1)
    throw new EntryRuleError('chip-unavailable');
  if (
    entry.permanentBaseline === null &&
    (chip === 'wildcard' || chip === 'free-hit')
  )
    throw new EntryRuleError('chip-needs-permanent-baseline');
  return {
    ...entry,
    chip,
    beforeFreeHit:
      chip === 'free-hit'
        ? { roster: entry.roster, transfers: entry.transfersThisRound }
        : null,
  };
}

export function cancelChip(entry: EditingEntry): EditingEntry {
  if (entry.chip === 'free-hit') {
    if (entry.beforeFreeHit === null)
      throw new EntryRuleError('missing-free-hit-cancellation-snapshot');
    return {
      ...entry,
      chip: null,
      roster: entry.beforeFreeHit.roster,
      transfersThisRound: entry.beforeFreeHit.transfers,
      beforeFreeHit: null,
    };
  }
  return { ...entry, chip: null, beforeFreeHit: null };
}

export interface LockedEntry {
  readonly roster: EntryRoster;
  readonly chip: Chip | null;
  readonly transferDeduction: PointUnits;
}

/** Run once per entry/gameweek under a transaction and unique snapshot key. */
export function lockAndAdvance(
  entry: EditingEntry,
  rules: TransferRules,
  nextRules: TransferRules = rules,
): { readonly locked: LockedEntry; readonly editing: EditingEntry } {
  if (
    !Number.isSafeInteger(rules.allowance) ||
    rules.allowance < 0 ||
    !Number.isSafeInteger(rules.carryCap) ||
    rules.carryCap < rules.allowance ||
    rules.extraTransferCost < 0
  )
    throw new EntryRuleError('invalid-transfer-rules');
  const covered = entry.chip === 'wildcard' || entry.chip === 'free-hit';
  const balance = covered
    ? entry.freeTransfers
    : Math.max(0, entry.freeTransfers - entry.transfersThisRound);
  if (
    !Number.isSafeInteger(nextRules.allowance) ||
    nextRules.allowance < 0 ||
    !Number.isSafeInteger(nextRules.carryCap) ||
    nextRules.carryCap < nextRules.allowance
  )
    throw new EntryRuleError('invalid-transfer-rules');
  const freeTransfers = Math.min(
    nextRules.carryCap,
    balance + nextRules.allowance,
  );
  if (!Number.isSafeInteger(freeTransfers))
    throw new EntryRuleError('transfer-balance-overflow');
  const permanent =
    entry.chip === 'free-hit' ? entry.permanentBaseline : entry.roster;
  if (permanent === null)
    throw new EntryRuleError('missing-permanent-baseline');
  const inventory = { ...entry.inventory };
  if (entry.chip !== null) {
    if (inventory[entry.chip] < 1) throw new EntryRuleError('chip-unavailable');
    inventory[entry.chip] -= 1;
  }
  return {
    locked: {
      roster: entry.roster,
      chip: entry.chip,
      transferDeduction: transferDeduction(entry, rules),
    },
    editing: {
      roster: permanent,
      permanentBaseline: permanent,
      freeTransfers,
      transfersThisRound: 0,
      chip: null,
      inventory,
      beforeFreeHit: null,
    },
  };
}
