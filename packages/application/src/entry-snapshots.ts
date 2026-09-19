import type { Kysely } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { lockedEntrySchema, snapshotRepairSchema } from '@fantasy/contracts';

/** Candidate repairs exist only inside the preview/publication transaction. */
export async function readRoundSnapshotRepairs(
  tx: Kysely<Database>,
  gameweekId: string,
) {
  return (
    await tx
      .selectFrom('entry_snapshot_repairs')
      .select('data')
      .where('gameweek_id', '=', gameweekId)
      .distinctOn('entry_id')
      .orderBy('entry_id')
      .orderBy('revision', 'desc')
      .execute()
  ).map((r) => snapshotRepairSchema.parse(r.data));
}
export async function readEffectiveRoundSnapshots(
  tx: Kysely<Database>,
  gameweekId: string,
) {
  const [originals, repairs] = await Promise.all([
    tx
      .selectFrom('entry_snapshots')
      .innerJoin('entries', 'entries.id', 'entry_snapshots.entry_id')
      .select([
        'entry_snapshots.entry_id',
        'entry_snapshots.competition_id',
        'entry_snapshots.payload',
        'entries.data as entry',
      ])
      .where('entry_snapshots.gameweek_id', '=', gameweekId)
      .orderBy('entry_snapshots.entry_id')
      .execute(),
    readRoundSnapshotRepairs(tx, gameweekId),
  ]);
  const byEntry = new Map(repairs.map((r) => [r.entryId, r]));
  return originals.map((r) => ({
    ...r,
    payload: byEntry.get(r.entry_id)?.snapshot ?? r.payload,
  }));
}
/** Historical publications resolve only repairs already present at that result revision. */
export async function readPublishedSnapshot(
  tx: Kysely<Database>,
  entryId: string,
  gameweekId: string,
  resultRevision: number,
) {
  const repair = await tx
    .selectFrom('entry_snapshot_repairs')
    .select('data')
    .where('entry_id', '=', entryId)
    .where('gameweek_id', '=', gameweekId)
    .where('result_revision', '<=', resultRevision)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  if (repair) return snapshotRepairSchema.parse(repair.data).snapshot;
  const original = await tx
    .selectFrom('entry_snapshots')
    .select('payload')
    .where('entry_id', '=', entryId)
    .where('gameweek_id', '=', gameweekId)
    .executeTakeFirst();
  const parsed = lockedEntrySchema.safeParse(original?.payload);
  return parsed.success ? parsed.data : null;
}
