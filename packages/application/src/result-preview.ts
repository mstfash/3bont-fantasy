import type { createDatabase } from '@fantasy/persistence';
import { gameweekSchema } from '@fantasy/contracts';
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
      return calculateResultImpact(tx, round);
    });
}
