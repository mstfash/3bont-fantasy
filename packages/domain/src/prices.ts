import { fantasyTicks, type FantasyTicks } from './quantities.ts';

export type SellingPricePolicy = 'half-gain-full-loss' | 'current-price';

/** Q11a: purchase ticks belong to this holding, not the footballer's market valuation. */
export function sellingPrice(
  purchase: FantasyTicks,
  current: FantasyTicks,
  policy: SellingPricePolicy = 'half-gain-full-loss',
): FantasyTicks {
  fantasyTicks(purchase);
  fantasyTicks(current);
  switch (policy) {
    case 'half-gain-full-loss':
      return fantasyTicks(
        current < purchase
          ? current
          : purchase + Math.floor((current - purchase) / 2),
      );
    case 'current-price':
      return current;
  }
}
