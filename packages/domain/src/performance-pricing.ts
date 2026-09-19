import {
  fantasyTicks,
  type FantasyTicks,
  type PointUnits,
} from './quantities.ts';

export interface PerformancePriceRules {
  readonly minimum: FantasyTicks;
  readonly maximum: FantasyTicks;
  readonly step: FantasyTicks;
  readonly observedGameweeks: number;
  readonly minimumMinutes: number;
  readonly riseAt: PointUnits;
  readonly fallAt: PointUnits;
}
export interface PriceObservation {
  readonly gameweekId: string;
  readonly revision: number;
  readonly number: number;
  readonly minutes: number | null;
  readonly points: PointUnits;
}
export interface PerformancePriceProposal {
  readonly oldPrice: FantasyTicks;
  readonly newPrice: FantasyTicks;
  readonly reason:
    | 'pinned'
    | 'insufficient-history'
    | 'incomplete-data'
    | 'insufficient-minutes'
    | 'rise'
    | 'fall'
    | 'within-band'
    | 'at-bound';
  readonly observations: readonly PriceObservation[];
  readonly pointsSum: bigint;
  readonly minutesSum: number;
  readonly calculationVersion: 'performance-price-v1';
}
/** Finalized, unmultiplied round scores only. The caller owns publication windows and deduplication. */
export function proposePerformancePrice(
  current: FantasyTicks,
  pinned: boolean,
  history: readonly PriceObservation[],
  rules: PerformancePriceRules,
): PerformancePriceProposal {
  if (
    !Number.isSafeInteger(rules.observedGameweeks) ||
    rules.observedGameweeks < 1 ||
    !Number.isSafeInteger(rules.minimumMinutes) ||
    rules.minimumMinutes < 0 ||
    rules.fallAt >= rules.riseAt ||
    rules.minimum > rules.maximum ||
    rules.step < 1 ||
    current < rules.minimum ||
    current > rules.maximum
  )
    throw new RangeError('Invalid price policy');
  for (const n of [
    current,
    rules.minimum,
    rules.maximum,
    rules.step,
    rules.riseAt,
    rules.fallAt,
  ])
    if (!Number.isSafeInteger(n)) throw new RangeError('Invalid price units');
  if (
    new Set(history.map((h) => h.gameweekId)).size !== history.length ||
    history.some(
      (h) =>
        !Number.isSafeInteger(h.number) ||
        h.number < 1 ||
        !Number.isSafeInteger(h.revision) ||
        h.revision < 1 ||
        !Number.isSafeInteger(h.points) ||
        (h.minutes !== null &&
          (!Number.isSafeInteger(h.minutes) || h.minutes < 0)),
    )
  )
    throw new RangeError('Invalid price observations');
  const observations = [...history]
    .sort((a, b) => b.number - a.number)
    .slice(0, rules.observedGameweeks);
  const pointsSum = observations.reduce((sum, h) => sum + BigInt(h.points), 0n);
  const minutesSum = observations.reduce((sum, h) => sum + (h.minutes ?? 0), 0);
  const proposal = (
    reason: PerformancePriceProposal['reason'],
    newPrice = current,
  ): PerformancePriceProposal => ({
    oldPrice: current,
    newPrice,
    reason,
    observations,
    pointsSum,
    minutesSum,
    calculationVersion: 'performance-price-v1',
  });
  if (pinned) return proposal('pinned');
  if (observations.length < rules.observedGameweeks)
    return proposal('insufficient-history');
  if (observations.some((h) => h.minutes === null))
    return proposal('incomplete-data');
  if (minutesSum < rules.minimumMinutes)
    return proposal('insufficient-minutes');
  const count = BigInt(observations.length);
  const direction =
    pointsSum >= BigInt(rules.riseAt) * count
      ? 1
      : pointsSum <= BigInt(rules.fallAt) * count
        ? -1
        : 0;
  if (direction === 0) return proposal('within-band');
  const price = fantasyTicks(
    Math.min(
      rules.maximum,
      Math.max(rules.minimum, current + direction * rules.step),
    ),
  );
  return proposal(
    price === current ? 'at-bound' : direction > 0 ? 'rise' : 'fall',
    price,
  );
}
