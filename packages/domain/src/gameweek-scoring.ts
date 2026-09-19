import {
  multiplyPoints,
  pointUnits,
  sumPoints,
  type PointUnits,
} from './quantities.ts';
import { POSITIONS, type Position, type SquadRules } from './squads.ts';
import type { LockedEntry } from './entry.ts';

export interface GameweekFootballer {
  readonly footballerId: string;
  readonly position: Position;
  /** Null means unresolved participation, never a confirmed non-appearance. */
  readonly minutes: number | null;
  readonly points: PointUnits;
}

export interface GameweekScoringOptions {
  readonly automaticSubstitutions: boolean;
  readonly captainMultiplier: number;
  readonly tripleCaptainMultiplier: number;
}

export type GameweekScore =
  | { readonly status: 'blocked'; readonly reason: string }
  | {
      readonly status: 'scored';
      readonly effectiveIds: readonly string[];
      readonly substitutions: readonly {
        readonly out: string;
        readonly in: string;
      }[];
      readonly captainId: string | null;
      readonly captainExtra: PointUnits;
      readonly playersTotal: PointUnits;
      readonly transferDeduction: PointUnits;
      readonly total: PointUnits;
    };

export const CLASSIC_GAMEWEEK_OPTIONS: GameweekScoringOptions = Object.freeze({
  automaticSubstitutions: true,
  captainMultiplier: 2,
  tripleCaptainMultiplier: 3,
});

interface Substitution {
  readonly out: string;
  readonly in: string;
  readonly starterIndex: number;
  readonly benchIndex: number;
}

/** Compare bench inclusion before considering starter-slot assignment. */
function preferable(
  candidate: readonly Substitution[],
  best: readonly Substitution[],
  benchSize: number,
): boolean {
  for (let index = 0; index < benchSize; index++) {
    const a = candidate.some((s) => s.benchIndex === index);
    const b = best.some((s) => s.benchIndex === index);
    if (a !== b) return a;
  }
  for (let index = 0; index < candidate.length; index++) {
    const a = candidate[index];
    const b = best[index];
    if (a && b && a.starterIndex !== b.starterIndex)
      return a.starterIndex < b.starterIndex;
  }
  return false;
}

function substitutions(
  locked: LockedEntry,
  players: ReadonlyMap<string, GameweekFootballer>,
  rules: SquadRules,
): readonly Substitution[] {
  const { starterIds, reserveIds } = locked.roster;
  const initial = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const absent = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of starterIds) {
    const player = players.get(id);
    if (player) {
      initial[player.position]++;
      if (player.minutes === 0) absent[player.position]++;
    }
  }
  // At most 256 bench subsets under the eight-reserve contract. Counting by
  // position avoids factorial starter-assignment search in larger templates.
  for (let mask = 2 ** reserveIds.length - 1; mask > 0; mask--) {
    const incoming = reserveIds.flatMap((id, benchIndex) => {
      if ((mask & (1 << (reserveIds.length - 1 - benchIndex))) === 0) return [];
      const player = players.get(id);
      return player ? [{ player, benchIndex }] : [];
    });
    if (
      incoming.some(
        ({ player }) => player.minutes === null || player.minutes === 0,
      )
    )
      continue;
    const additions = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const { player } of incoming) additions[player.position]++;
    let best: readonly Substitution[] | null = null;
    for (const formation of rules.formations) {
      const removed = {
        GK: initial.GK + additions.GK - formation.GK,
        DEF: initial.DEF + additions.DEF - formation.DEF,
        MID: initial.MID + additions.MID - formation.MID,
        FWD: initial.FWD + additions.FWD - formation.FWD,
      };
      if (
        removed.GK !== additions.GK ||
        POSITIONS.some((p) => removed[p] < 0 || removed[p] > absent[p])
      )
        continue;
      const chosen: Substitution[] = [];
      for (const { player: reserve, benchIndex } of incoming) {
        for (const [starterIndex, out] of starterIds.entries()) {
          const starter = players.get(out);
          if (
            !starter ||
            starter.minutes !== 0 ||
            removed[starter.position] === 0 ||
            chosen.some((s) => s.out === out)
          )
            continue;
          if ((reserve.position === 'GK') !== (starter.position === 'GK'))
            continue;
          chosen.push({
            in: reserve.footballerId,
            out,
            starterIndex,
            benchIndex,
          });
          removed[starter.position]--;
          break;
        }
      }
      if (
        chosen.length === incoming.length &&
        POSITIONS.every((p) => removed[p] === 0) &&
        (best === null || preferable(chosen, best, reserveIds.length))
      )
        best = chosen;
    }
    if (best !== null) return best;
  }
  return [];
}

/** Inputs are the aggregate scores and participation for ALL fixtures assigned to this gameweek. */
export function scoreGameweek(
  locked: LockedEntry,
  footballers: readonly GameweekFootballer[],
  rules: SquadRules,
  options: GameweekScoringOptions = CLASSIC_GAMEWEEK_OPTIONS,
  stage: 'live' | 'settled' = 'settled',
): GameweekScore {
  const players = new Map(footballers.map((p) => [p.footballerId, p]));
  const owned = locked.roster.holdings.map((h) => h.footballerId);
  if (
    players.size !== footballers.length ||
    new Set(owned).size !== owned.length
  )
    return { status: 'blocked', reason: 'duplicate-footballer' };
  const lineup = [...locked.roster.starterIds, ...locked.roster.reserveIds];
  if (
    locked.roster.reserveIds.length > 8 ||
    lineup.length !== rules.squadSize ||
    owned.length !== rules.squadSize ||
    locked.roster.starterIds.length !== rules.starterCount ||
    new Set(lineup).size !== lineup.length ||
    lineup.some((id) => !owned.includes(id))
  )
    return { status: 'blocked', reason: 'invalid-lineup' };
  if (
    owned.some(
      (id) =>
        !players.has(id) ||
        (stage === 'settled' && players.get(id)?.minutes === null),
    )
  )
    return { status: 'blocked', reason: 'unresolved-participation' };
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of locked.roster.starterIds) {
    const player = players.get(id);
    if (!player || !POSITIONS.includes(player.position))
      return { status: 'blocked', reason: 'invalid-position' };
    counts[player.position]++;
  }
  if (!rules.formations.some((f) => POSITIONS.every((p) => f[p] === counts[p])))
    return { status: 'blocked', reason: 'invalid-locked-formation' };
  if (
    footballers.some(
      (p) =>
        p.minutes !== null &&
        (!Number.isSafeInteger(p.minutes) ||
          p.minutes < 0 ||
          !Number.isSafeInteger(p.points)),
    )
  )
    return { status: 'blocked', reason: 'invalid-performance' };
  if (
    [options.captainMultiplier, options.tripleCaptainMultiplier].some(
      (m) => !Number.isSafeInteger(m) || m < 1,
    ) ||
    locked.transferDeduction < 0
  )
    return { status: 'blocked', reason: 'invalid-scoring-options' };
  const changes =
    stage === 'settled' &&
    locked.chip !== 'bench-boost' &&
    options.automaticSubstitutions
      ? substitutions(locked, players, rules)
      : [];
  const effectiveIds =
    locked.chip === 'bench-boost'
      ? owned
      : locked.roster.starterIds.map(
          (id) => changes.find((s) => s.out === id)?.in ?? id,
        );
  const captaincy = locked.roster.captaincy;
  if (
    rules.captaincyEnabled &&
    (captaincy === null ||
      captaincy.captainId === captaincy.viceCaptainId ||
      !locked.roster.starterIds.includes(captaincy.captainId) ||
      !locked.roster.starterIds.includes(captaincy.viceCaptainId))
  )
    return { status: 'blocked', reason: 'invalid-captaincy' };
  let captainId: string | null = null;
  if (rules.captaincyEnabled && captaincy) {
    if ((players.get(captaincy.captainId)?.minutes ?? 0) > 0)
      captainId = captaincy.captainId;
    else if (
      stage === 'settled' &&
      (players.get(captaincy.viceCaptainId)?.minutes ?? 0) > 0
    )
      captainId = captaincy.viceCaptainId;
  }
  const multiplier =
    locked.chip === 'triple-captain'
      ? options.tripleCaptainMultiplier
      : options.captainMultiplier;
  const captainExtra =
    captainId === null
      ? pointUnits(0)
      : multiplyPoints(
          players.get(captainId)?.points ?? pointUnits(0),
          multiplier - 1,
        );
  const playersTotal = sumPoints(
    effectiveIds.map((id) => players.get(id)?.points ?? pointUnits(0)),
  );
  return {
    status: 'scored',
    effectiveIds,
    substitutions: changes.map((s) => ({ in: s.in, out: s.out })),
    captainId,
    captainExtra,
    playersTotal,
    transferDeduction: locked.transferDeduction,
    total: sumPoints([
      playersTotal,
      captainExtra,
      pointUnits(0 - locked.transferDeduction),
    ]),
  };
}
