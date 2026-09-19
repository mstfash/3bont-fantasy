import { fantasyTicks, type FantasyTicks } from './quantities.ts';
import { POSITIONS, type Position } from './squads.ts';
export interface InitialValuation {
  readonly amountMinor: number;
  readonly currency: string;
  readonly asOf: string;
  readonly licensedForDisplay: boolean;
}
export interface InitialPriceCandidate {
  readonly footballerId: string;
  readonly position: Position;
  readonly valuation: InitialValuation | null;
}
export interface InitialPricePolicy {
  readonly currency: string;
  readonly staleDays: number;
  readonly bounds: Readonly<
    Record<
      Position,
      { readonly minimum: FantasyTicks; readonly maximum: FantasyTicks }
    >
  >;
}
export interface InitialPriceSuggestion {
  readonly footballerId: string;
  readonly position: Position;
  readonly price: FantasyTicks | null;
  readonly comparableCount: number;
  readonly reason:
    | 'suggested'
    | 'missing-valuation'
    | 'display-rights-unverified'
    | 'different-currency'
    | 'stale-valuation'
    | 'future-valuation'
    | 'invalid-valuation';
}
function valuationReason(
  value: InitialValuation | null,
  policy: InitialPricePolicy,
  now: number,
): InitialPriceSuggestion['reason'] {
  if (value === null) return 'missing-valuation';
  if (
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor < 0 ||
    !Number.isFinite(Date.parse(value.asOf))
  )
    return 'invalid-valuation';
  if (!value.licensedForDisplay) return 'display-rights-unverified';
  if (value.currency !== policy.currency) return 'different-currency';
  const observed = Date.parse(value.asOf);
  if (observed > now) return 'future-valuation';
  if (now - observed > policy.staleDays * 86400000) return 'stale-valuation';
  return 'suggested';
}
/** Position-relative midranks; exact integer interpolation, equal values share prices. Never converts currencies. */
export function suggestInitialPrices(
  candidates: readonly InitialPriceCandidate[],
  policy: InitialPricePolicy,
  now: Date,
): readonly InitialPriceSuggestion[] {
  if (
    !Number.isFinite(now.getTime()) ||
    !/^[A-Z]{3}$/u.test(policy.currency) ||
    !Number.isSafeInteger(policy.staleDays) ||
    policy.staleDays < 1 ||
    policy.staleDays > 3650 ||
    new Set(candidates.map((p) => p.footballerId)).size !== candidates.length
  )
    throw new RangeError('Invalid initial price inputs');
  for (const position of POSITIONS) {
    const b = policy.bounds[position];
    fantasyTicks(b.minimum);
    fantasyTicks(b.maximum);
    if (b.maximum < b.minimum)
      throw new RangeError('Invalid initial price bounds');
  }
  const results: InitialPriceSuggestion[] = candidates.map((p) => {
    if (!p.footballerId || !POSITIONS.includes(p.position))
      throw new RangeError('Invalid initial price candidate');
    const reason = valuationReason(p.valuation, policy, now.getTime());
    return {
      footballerId: p.footballerId,
      position: p.position,
      price: null,
      comparableCount: 0,
      reason,
    };
  });
  for (const position of POSITIONS) {
    const eligible = candidates
      .flatMap((candidate, index) => {
        if (
          candidate.position !== position ||
          results[index]?.reason !== 'suggested'
        )
          return [];
        if (candidate.valuation === null)
          throw new Error('Eligible valuation is missing');
        return [
          {
            footballerId: candidate.footballerId,
            index,
            amountMinor: candidate.valuation.amountMinor,
          },
        ];
      })
      .sort(
        (a, b) =>
          a.amountMinor - b.amountMinor ||
          a.footballerId.localeCompare(b.footballerId),
      );
    const bound = policy.bounds[position],
      count = eligible.length;
    for (let start = 0; start < count;) {
      let end = start;
      while (
        end + 1 < count &&
        eligible[end + 1]?.amountMinor === eligible[start]?.amountMinor
      )
        end++;
      const numerator =
          BigInt(bound.maximum - bound.minimum) *
          BigInt(count === 1 ? 1 : start + end),
        denominator = BigInt(count === 1 ? 2 : 2 * (count - 1));
      const price = fantasyTicks(
        Number(
          BigInt(bound.minimum) +
            (2n * numerator + denominator) / (2n * denominator),
        ),
      );
      for (let i = start; i <= end; i++) {
        const item = eligible[i];
        if (!item) throw new Error('Missing ranked valuation');
        results[item.index] = {
          footballerId: item.footballerId,
          position,
          price,
          comparableCount: count,
          reason: 'suggested',
        };
      }
      start = end + 1;
    }
  }
  return results;
}
