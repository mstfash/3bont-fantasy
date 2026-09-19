import { pointUnits, type PointUnits } from './quantities.ts';

export interface StandingInput {
  readonly entryId: string;
  readonly accountId: string;
  readonly points: PointUnits;
  readonly transferDeductions: PointUnits;
  readonly effectiveGoals: number;
}
export type RankPolicy = 'shared' | 'deductions-then-goals';
export interface RankedEntry extends StandingInput {
  readonly rank: number;
}

function sportingOrder(
  a: StandingInput,
  b: StandingInput,
  policy: RankPolicy,
): number {
  return (
    b.points - a.points ||
    (policy === 'deductions-then-goals'
      ? a.transferDeductions - b.transferDeductions ||
        b.effectiveGoals - a.effectiveGoals
      : 0)
  );
}

/** Identity only stabilizes display order; it never changes rank or wins a sporting tie. */
export function rankEntries(
  entries: readonly StandingInput[],
  policy: RankPolicy = 'shared',
): readonly RankedEntry[] {
  if (new Set(entries.map((e) => e.entryId)).size !== entries.length)
    throw new RangeError('Duplicate entry');
  for (const entry of entries) {
    pointUnits(entry.points);
    pointUnits(entry.transferDeductions);
    if (
      entry.transferDeductions < 0 ||
      !Number.isSafeInteger(entry.effectiveGoals) ||
      entry.effectiveGoals < 0
    )
      throw new RangeError('Invalid ranking inputs');
  }
  const ordered = [...entries].sort(
    (a, b) =>
      sportingOrder(a, b, policy) ||
      (a.entryId < b.entryId ? -1 : a.entryId === b.entryId ? 0 : 1),
  );
  let rank = 1;
  return ordered.map((entry, index) => {
    const previous = ordered[index - 1];
    if (previous && sportingOrder(previous, entry, policy) !== 0)
      rank = index + 1;
    return { ...entry, rank };
  });
}

export interface CashAllocation {
  readonly entryId: string;
  readonly accountId: string;
  readonly rank: number;
  readonly amountMinor: number;
}

/** Eligibility, currency and final revision must be established before calling this pure calculator. */
export function allocateCashPrizes(
  entries: readonly StandingInput[],
  placesMinor: readonly number[],
  policy: RankPolicy = 'shared',
  oneAwardPerAccount = true,
): {
  readonly awards: readonly CashAllocation[];
  readonly remainderMinor: number;
} {
  if (placesMinor.some((n) => !Number.isSafeInteger(n) || n < 0))
    throw new RangeError('Invalid cash prize amount');
  const seen = new Set<string>();
  const eligible = rankEntries(entries, policy).filter((entry) => {
    if (!oneAwardPerAccount) return true;
    if (seen.has(entry.accountId)) return false;
    seen.add(entry.accountId);
    return true;
  });
  const ranks = rankEntries(eligible, policy);
  const awards: CashAllocation[] = [];
  let remainder = 0n;
  for (const rank of new Set(ranks.map((e) => e.rank))) {
    const tied = ranks.filter((e) => e.rank === rank);
    const pot = placesMinor
      .slice(rank - 1, rank - 1 + tied.length)
      .reduce((sum, n) => sum + BigInt(n), 0n);
    const amount = pot / BigInt(tied.length);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new RangeError('Prize overflow');
    remainder += pot % BigInt(tied.length);
    if (amount > 0n)
      awards.push(
        ...tied.map((entry) => ({
          entryId: entry.entryId,
          accountId: entry.accountId,
          rank,
          amountMinor: Number(amount),
        })),
      );
  }
  if (remainder > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Prize remainder overflow');
  return { awards, remainderMinor: Number(remainder) };
}
