import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  entrySchema,
  lockedEntrySchema,
  snapshotRepairSchema,
  type Gameweek,
} from '@fantasy/contracts';
import { lockAndAdvance } from '@fantasy/domain';
import { CommandRejected } from './errors.ts';
export const snapshotDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** No client-supplied lineup or receipt selection can enter this reconstruction. */
export async function reconstructSnapshot(
  tx: Transaction<Database>,
  round: Gameweek,
  entryId: string,
) {
  const entryRow = await tx
    .selectFrom('entries')
    .select('data')
    .where('id', '=', entryId)
    .where('competition_id', '=', round.competitionId)
    .executeTakeFirst();
  const original = await tx
    .selectFrom('entry_snapshots')
    .selectAll()
    .where('entry_id', '=', entryId)
    .where('gameweek_id', '=', round.id)
    .where('competition_id', '=', round.competitionId)
    .executeTakeFirst();
  if (
    !entryRow ||
    !original ||
    new Date(original.locked_at).getTime() !== Date.parse(round.deadline)
  )
    throw new CommandRejected('snapshot-source-unavailable');
  const entry = entrySchema.parse(entryRow.data);
  const receipts = await tx
    .selectFrom('commands')
    .selectAll()
    .where('actor_id', '=', entry.accountId)
    .where(sql<string>`result->>'id'`, '=', entry.id)
    .where(sql<string>`result->>'editingGameweekId'`, '=', round.id)
    .where('accepted_at', '<', new Date(round.deadline))
    .orderBy('accepted_at', 'desc')
    .limit(2)
    .forShare()
    .execute();
  const receipt = receipts[0];
  const accepted = entrySchema.safeParse(receipt?.result);
  if (
    !receipt ||
    !accepted.success ||
    accepted.data.accountId !== entry.accountId ||
    accepted.data.competitionId !== round.competitionId ||
    accepted.data.status !== 'active'
  )
    throw new CommandRejected('snapshot-source-unavailable');
  if (receipts[1]?.accepted_at.getTime() === receipt.accepted_at.getTime())
    throw new CommandRejected('snapshot-source-ambiguous');
  const latestRow = await tx
    .selectFrom('entry_snapshot_repairs')
    .select('data')
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  const latest = latestRow ? snapshotRepairSchema.parse(latestRow.data) : null;
  const before = lockedEntrySchema.safeParse(
    latest?.snapshot ?? original.payload,
  );
  const snapshot = lockedEntrySchema.parse(
    lockAndAdvance(accepted.data.state, round.rules.transfer).locked,
  );
  if (
    before.success &&
    snapshotDigest(before.data) === snapshotDigest(snapshot)
  )
    throw new CommandRejected('snapshot-no-change');
  return {
    entry,
    snapshot,
    before: before.success ? before.data : null,
    beforeFingerprint: snapshotDigest(latest?.snapshot ?? original.payload),
    originalFingerprint: snapshotDigest(original.payload),
    revision: (latest?.revision ?? 1) + 1,
    source: {
      commandId: receipt.command_id,
      accountId: receipt.actor_id,
      acceptedAt: receipt.accepted_at.toISOString(),
      entryRevision: accepted.data.revision,
      commandFingerprint: receipt.fingerprint,
      resultFingerprint: snapshotDigest(receipt.result),
      state: accepted.data.state,
    },
  };
}
