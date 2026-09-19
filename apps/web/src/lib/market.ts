import type { Club, Footballer, PoolPlayer } from '@fantasy/contracts';

export interface MarketPlayer {
  readonly valuationStale: boolean;
  readonly pool: PoolPlayer;
  readonly footballer: Footballer;
  readonly club: Club;
}
