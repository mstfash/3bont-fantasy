import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { gameweekSchema, type Gameweek } from '@fantasy/contracts';
import { publishGameweekWithinTransaction } from './results.ts';

/** Caller holds current authority, parent/round/dependency locks and an exact reviewed proposal. */
export async function publishReviewedCorrection(
  tx: Transaction<Database>,
  candidate: Gameweek,
  actorId: string,
  now: Date,
) {
  await tx
    .updateTable('result_reviews')
    .set({ status: 'resolved', resolved_at: now, resolved_by: actorId })
    .where('gameweek_id', '=', candidate.id)
    .where('status', '=', 'open')
    .execute();
  await tx
    .updateTable('gameweeks')
    .set({
      data: {
        ...candidate,
        status: 'provisional',
        finalizedAt: null,
        lastMaterialChangeAt: now.toISOString(),
      },
    })
    .where('id', '=', candidate.id)
    .execute();
  await publishGameweekWithinTransaction(tx, candidate.id);
  const updated = gameweekSchema.parse(
    (
      await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', candidate.id)
        .executeTakeFirstOrThrow()
    ).data,
  );
  if (updated.resultRevision !== candidate.resultRevision + 1)
    throw new Error(
      'Reviewed correction did not publish one complete result revision',
    );
  return updated;
}
