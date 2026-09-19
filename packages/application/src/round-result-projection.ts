import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  entryResultSchema,
  lockedEntrySchema,
  type EntryResult,
  type Gameweek,
} from '@fantasy/contracts';
import { calculateRoundInputs } from './round-inputs.ts';
import { calculateEntryResult } from './entry-calculation.ts';

/** One coherent, in-memory replacement shared by competition and prize correction reviews. */
export async function calculateRoundResultProjection(
  tx: Transaction<Database>,
  round: Gameweek,
) {
  const inputs = await calculateRoundInputs(tx, round);
  const [snapshots, previous] = await Promise.all([
    tx
      .selectFrom('entry_snapshots')
      .innerJoin('entries', 'entries.id', 'entry_snapshots.entry_id')
      .select([
        'entry_snapshots.entry_id',
        'entry_snapshots.payload',
        'entries.data as entry',
      ])
      .where('entry_snapshots.gameweek_id', '=', round.id)
      .orderBy('entry_snapshots.entry_id')
      .execute(),
    tx
      .selectFrom('entry_results')
      .select(['entry_id', 'payload'])
      .where('gameweek_id', '=', round.id)
      .where('revision', '=', round.resultRevision)
      .orderBy('entry_id')
      .execute(),
  ]);
  const players = new Map(
    inputs.players.map((player) => [player.footballerId, player]),
  );
  const previousByEntry = new Map(
    previous.map((row) => [row.entry_id, entryResultSchema.parse(row.payload)]),
  );
  const replacement = new Map<string, EntryResult>();
  const changes = snapshots.map((snapshot) => {
    const result = calculateEntryResult(
      lockedEntrySchema.parse(snapshot.payload),
      round,
      players,
      inputs.settled,
    );
    if (result.status === 'scored')
      replacement.set(snapshot.entry_id, result.payload);
    return {
      entryId: snapshot.entry_id,
      name: snapshot.entry.name,
      before: previousByEntry.get(snapshot.entry_id)?.total ?? null,
      after: result.status === 'scored' ? result.payload.total : null,
    };
  });
  // A missing/blocked squad must never disappear from a hypothetical leaderboard.
  const complete =
    replacement.size === snapshots.length &&
    previous.every((row) => replacement.has(row.entry_id));
  return { inputs, changes, replacement: complete ? replacement : null };
}
