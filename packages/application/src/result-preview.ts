import type { createDatabase } from '@fantasy/persistence';
import { gameweekSchema } from '@fantasy/contracts';
import { hasPrizeReadScope } from './prize-access.ts';
import { visibleGroupImpact } from './group-result-impact.ts';
import { calculateResultImpact } from './result-impact.ts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

export async function previewGameweekResults(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  gameweekId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', gameweekId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('gameweek-unavailable');
      const round = gameweekSchema.parse(row.data);
      requireCapability(
        principal,
        grants,
        'competition.manage',
        round.competitionId,
        new Date(),
      );
      const { groupImpact, prizeImpacts, ...impact } =
        await calculateResultImpact(tx, round);
      return {
        ...impact,
        prizeImpacts: hasPrizeReadScope(grants, round.competitionId)
          ? prizeImpacts
          : null,
        groupImpact: await visibleGroupImpact(
          tx,
          groupImpact,
          principal.accountId,
        ),
      };
    });
}
