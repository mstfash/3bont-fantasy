import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import type { HeadToHeadEdition } from '@fantasy/contracts';
/** Caller holds the competition share lock and group update lock. Locked games keep their contestants. */
export async function withdrawEditionEntry(
  tx: Transaction<Database>,
  edition: HeadToHeadEdition,
  entryId: string,
  now: Date,
  reason: string,
): Promise<void> {
  if (edition.status !== 'published') {
    await tx
      .deleteFrom('h2h_registrations')
      .where('edition_id', '=', edition.id)
      .where('entry_id', '=', entryId)
      .execute();
    return;
  }
  const future = await tx
    .selectFrom('gameweeks')
    .select('id')
    .where('id', 'in', edition.gameweekIds)
    .where('deadline', '>', now)
    .execute();
  if (future.length)
    await tx
      .insertInto('h2h_forfeits')
      .values(
        future.map((round) => ({
          edition_id: edition.id,
          competition_id: edition.competitionId,
          entry_id: entryId,
          gameweek_id: round.id,
          reason,
          created_at: now,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['edition_id', 'entry_id', 'gameweek_id']).doNothing(),
      )
      .execute();
}
export async function withdrawGroupEditions(
  tx: Transaction<Database>,
  groupId: string,
  entryId: string,
  now: Date,
): Promise<void> {
  const editions = await tx
    .selectFrom('h2h_editions')
    .innerJoin(
      'h2h_registrations',
      'h2h_registrations.edition_id',
      'h2h_editions.id',
    )
    .select('h2h_editions.data')
    .where('group_id', '=', groupId)
    .where('entry_id', '=', entryId)
    .execute();
  for (const { data: edition } of editions)
    await withdrawEditionEntry(
      tx,
      edition,
      entryId,
      now,
      'Group membership ended',
    );
}
