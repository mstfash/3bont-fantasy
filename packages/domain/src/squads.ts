import { fantasyPrice, fantasyTicks, type FantasyTicks } from './quantities.ts';

export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;
export type Position = (typeof POSITIONS)[number];
export type PositionCounts = Readonly<Record<Position, number>>;

export interface SquadRules {
  readonly squadSize: number;
  readonly quotas: PositionCounts;
  readonly starterCount: number;
  readonly formations: readonly PositionCounts[];
  readonly startingBudget: FantasyTicks;
  readonly clubCap: number;
  readonly captaincyEnabled: boolean;
}

export interface SelectedFootballer {
  readonly footballerId: string;
  readonly clubId: string;
  readonly position: Position;
  readonly price: FantasyTicks;
}

export interface SquadSelection {
  readonly players: readonly SelectedFootballer[];
  readonly starterIds: readonly string[];
  /** All non-starters, including reserve goalkeepers, in the saved priority order. */
  readonly reserveIds: readonly string[];
  readonly captaincy: {
    readonly captainId: string;
    readonly viceCaptainId: string;
  } | null;
}

export interface SquadIssue {
  readonly code:
    | 'invalid-configuration'
    | 'invalid-player'
    | 'duplicate-footballer'
    | 'squad-size'
    | 'position-quota'
    | 'club-cap'
    | 'over-budget'
    | 'lineup-membership'
    | 'lineup-size'
    | 'formation'
    | 'captaincy';
  readonly path: string;
}

export const CLASSIC_SQUAD_RULES: SquadRules = Object.freeze({
  squadSize: 15,
  quotas: Object.freeze({ GK: 2, DEF: 5, MID: 5, FWD: 3 }),
  starterCount: 11,
  formations: Object.freeze(
    [
      { GK: 1, DEF: 3, MID: 4, FWD: 3 },
      { GK: 1, DEF: 3, MID: 5, FWD: 2 },
      { GK: 1, DEF: 4, MID: 3, FWD: 3 },
      { GK: 1, DEF: 4, MID: 4, FWD: 2 },
      { GK: 1, DEF: 4, MID: 5, FWD: 1 },
      { GK: 1, DEF: 5, MID: 2, FWD: 3 },
      { GK: 1, DEF: 5, MID: 3, FWD: 2 },
      { GK: 1, DEF: 5, MID: 4, FWD: 1 },
    ].map((formation) => Object.freeze(formation)),
  ),
  startingBudget: fantasyPrice('100'),
  clubCap: 3,
  captaincyEnabled: true,
});

function nonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function countTotal(counts: PositionCounts): number {
  return POSITIONS.reduce((total, position) => total + counts[position], 0);
}

export function validateSquadRules(rules: SquadRules): readonly SquadIssue[] {
  const issues: SquadIssue[] = [];
  const invalid = (path: string): void => {
    issues.push({ code: 'invalid-configuration', path });
  };
  if (!nonnegativeInteger(rules.squadSize) || rules.squadSize < 1)
    invalid('squadSize');
  if (
    !nonnegativeInteger(rules.starterCount) ||
    rules.starterCount < 1 ||
    rules.starterCount > rules.squadSize
  )
    invalid('starterCount');
  if (!nonnegativeInteger(rules.clubCap) || rules.clubCap < 1)
    invalid('clubCap');
  if (!nonnegativeInteger(rules.startingBudget)) invalid('startingBudget');
  if (
    POSITIONS.some((p) => !nonnegativeInteger(rules.quotas[p])) ||
    countTotal(rules.quotas) !== rules.squadSize
  )
    invalid('quotas');
  if (rules.formations.length === 0) invalid('formations');
  rules.formations.forEach((formation, index) => {
    if (
      POSITIONS.some(
        (p) =>
          !nonnegativeInteger(formation[p]) || formation[p] > rules.quotas[p],
      ) ||
      countTotal(formation) !== rules.starterCount
    )
      invalid(`formations[${String(index)}]`);
  });
  if (rules.captaincyEnabled && rules.starterCount < 2)
    invalid('captaincyEnabled');
  return issues;
}

/** Initial construction only: later transfers use holding/sale ledgers, not this starting-budget check. */
export function validateInitialSquad(
  selection: SquadSelection,
  rules: SquadRules,
): readonly SquadIssue[] {
  const configurationIssues = validateSquadRules(rules);
  if (configurationIssues.length > 0) return configurationIssues;
  const issues: SquadIssue[] = [];
  const players = new Map<string, SelectedFootballer>();
  const clubs = new Map<string, number>();
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let spent = 0n;
  for (const [index, player] of selection.players.entries()) {
    if (
      !player.footballerId.trim() ||
      !player.clubId.trim() ||
      !nonnegativeInteger(player.price) ||
      !POSITIONS.includes(player.position)
    ) {
      issues.push({
        code: 'invalid-player',
        path: `players[${String(index)}]`,
      });
      continue;
    }
    if (players.has(player.footballerId))
      issues.push({
        code: 'duplicate-footballer',
        path: `players[${String(index)}]`,
      });
    players.set(player.footballerId, player);
    clubs.set(player.clubId, (clubs.get(player.clubId) ?? 0) + 1);
    counts[player.position] += 1;
    spent += BigInt(player.price);
  }
  if (selection.players.length !== rules.squadSize)
    issues.push({ code: 'squad-size', path: 'players' });
  for (const position of POSITIONS) {
    if (counts[position] !== rules.quotas[position])
      issues.push({ code: 'position-quota', path: `players.${position}` });
  }
  for (const [clubId, count] of clubs) {
    if (count > rules.clubCap)
      issues.push({ code: 'club-cap', path: `clubs.${clubId}` });
  }
  if (spent > BigInt(fantasyTicks(rules.startingBudget)))
    issues.push({ code: 'over-budget', path: 'players' });
  const orderedIds = [...selection.starterIds, ...selection.reserveIds];
  if (
    orderedIds.length !== players.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !players.has(id))
  )
    issues.push({ code: 'lineup-membership', path: 'lineup' });
  if (
    selection.starterIds.length !== rules.starterCount ||
    selection.reserveIds.length !== rules.squadSize - rules.starterCount
  ) {
    issues.push({ code: 'lineup-size', path: 'lineup' });
  }
  const starters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of selection.starterIds) {
    const player = players.get(id);
    if (player) starters[player.position] += 1;
  }
  if (
    !rules.formations.some((formation) =>
      POSITIONS.every((p) => formation[p] === starters[p]),
    )
  ) {
    issues.push({ code: 'formation', path: 'starterIds' });
  }
  const captaincy = selection.captaincy;
  if (
    rules.captaincyEnabled
      ? captaincy === null ||
        captaincy.captainId === captaincy.viceCaptainId ||
        !selection.starterIds.includes(captaincy.captainId) ||
        !selection.starterIds.includes(captaincy.viceCaptainId)
      : captaincy !== null
  ) {
    issues.push({ code: 'captaincy', path: 'captaincy' });
  }
  return issues;
}
