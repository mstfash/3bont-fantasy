import type { createDatabase } from '@fantasy/persistence';
import { gameweekSchema, prizePoolSchema } from '@fantasy/contracts';
import type { Principal, StaffGrant } from './authorization.ts';
import { requirePrizeReader } from './prize-access.ts';
import { CommandRejected } from './errors.ts';
import { calculateRoundResultProjection } from './round-result-projection.ts';
import { calculatePrizeResultImpact } from './prize-result-impact.ts';

/** Prize staff can inspect one pool without acquiring competition-management or private-group permissions. */
export async function previewPrizeResultCorrection(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  poolId: string,
  gameweekId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('id', '=', poolId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('prize-pool-unavailable');
      const pool = prizePoolSchema.parse(row.data);
      requirePrizeReader(principal, grants, pool.competitionId);
      const roundRow = await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', gameweekId)
        .where('competition_id', '=', pool.competitionId)
        .executeTakeFirst();
      if (
        !roundRow ||
        pool.state !== 'published' ||
        !pool.gameweekIds.includes(gameweekId)
      )
        throw new CommandRejected('prize-correction-outside-window');
      const round = gameweekSchema.parse(roundRow.data);
      return {
        round,
        impact: await calculatePrizeResultImpact(
          tx,
          pool,
          round,
          await calculateRoundResultProjection(tx, round),
        ),
      };
    });
}
