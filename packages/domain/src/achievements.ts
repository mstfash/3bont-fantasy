import type { PointUnits } from './quantities.ts';
export type AchievementCondition =
  | { readonly kind: 'activated' }
  | { readonly kind: 'positive-round' }
  | { readonly kind: 'points'; readonly minimum: PointUnits }
  | { readonly kind: 'top-rank'; readonly maximumRank: number }
  | {
      readonly kind: 'streak';
      readonly length: number;
      readonly minimum: PointUnits;
    };
export interface AchievementRound {
  readonly number: number;
  readonly finalized: boolean;
  readonly points: PointUnits | null;
  readonly rank: number | null;
}
/** A witness is the earliest qualifying declared round sequence; unresolved data cannot extend it. */
export function achievementWitness(
  condition: AchievementCondition,
  firstRound: number,
  lastRound: number,
  entryFirstRound: number,
  rounds: readonly AchievementRound[],
): readonly number[] | null {
  if (firstRound > lastRound) return null;
  if (condition.kind === 'activated')
    return entryFirstRound >= firstRound && entryFirstRound <= lastRound
      ? []
      : null;
  const eligible = rounds
    .filter(
      (r) =>
        r.number >= Math.max(firstRound, entryFirstRound) &&
        r.number <= lastRound,
    )
    .sort((a, b) => a.number - b.number);
  if (new Set(eligible.map((r) => r.number)).size !== eligible.length)
    throw new RangeError('Duplicate achievement round');
  let streak: number[] = [];
  for (const round of eligible) {
    if (!round.finalized || round.points === null) {
      streak = [];
      continue;
    }
    if (condition.kind === 'positive-round' && round.points > 0)
      return [round.number];
    if (condition.kind === 'points' && round.points >= condition.minimum)
      return [round.number];
    if (
      condition.kind === 'top-rank' &&
      round.rank !== null &&
      round.rank <= condition.maximumRank
    )
      return [round.number];
    if (condition.kind === 'streak') {
      streak =
        round.points >= condition.minimum ? [...streak, round.number] : [];
      if (streak.length >= condition.length)
        return streak.slice(-condition.length);
    }
  }
  return null;
}
