import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  competitionSchema,
  entryResultSchema,
  lockedEntrySchema,
  type EntryResult,
  type Gameweek,
} from '@fantasy/contracts';
import { calculateGroupResultImpact } from './group-result-impact.ts';
import { calculateRoundInputs } from './round-inputs.ts';
import { calculateEntryResult } from './entry-calculation.ts';
import { standingsWithinTransaction, compareStandings } from './leaderboard.ts';

/** Caller holds a consistent read snapshot, or the competition/fixture write barriers. */
export async function calculateResultImpact(
  tx: Transaction<Database>,
  round: Gameweek,
) {
  const competition = competitionSchema.parse(
    (
      await tx
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', round.competitionId)
        .executeTakeFirstOrThrow()
    ).data,
  );
  const inputs = await calculateRoundInputs(tx, round);
  const [snapshots, previous, beforeRanks, pools, revisions] =
    await Promise.all([
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
      standingsWithinTransaction(tx, competition),
      tx
        .selectFrom('prize_pools')
        .select(['id', 'revision', 'data'])
        .where('competition_id', '=', round.competitionId)
        .where(sql<string>`data->>'state'`, '=', 'published')
        .orderBy('id')
        .execute(),
      tx
        .selectFrom('gameweeks')
        .select(['id', 'data'])
        .where('competition_id', '=', round.competitionId)
        .orderBy('id')
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
  const afterRanks = complete
    ? await standingsWithinTransaction(tx, competition, {
        replacement: {
          gameweekId: round.id,
          number: round.number,
          results: replacement,
        },
      })
    : null;
  const rankings = compareStandings(beforeRanks, afterRanks);
  const groupImpact = await calculateGroupResultImpact(
    tx,
    competition,
    round,
    complete ? replacement : null,
  );
  const affectedPools = pools.filter((pool) =>
    pool.data.gameweekIds.includes(round.id),
  );
  const poolIds = affectedPools.map((pool) => pool.id);
  const [proposals, corrections] = poolIds.length
    ? await Promise.all([
        tx
          .selectFrom('prize_proposals')
          .select(['id', 'revision', 'data'])
          .where('pool_id', 'in', poolIds)
          .orderBy('id')
          .execute(),
        tx
          .selectFrom('prize_correction_cases')
          .select(['id', 'revision', 'data'])
          .where('pool_id', 'in', poolIds)
          .orderBy('id')
          .execute(),
      ])
    : [[], []];
  // Competition managers receive operational counts, never payout details or recipient identities.
  const prizes = {
    publishedPools: affectedPools.length,
    pendingProposals: proposals.filter((row) =>
      ['prepared', 'reviewed', 'approved'].includes(row.data.state),
    ).length,
    fulfilledProposals: proposals.filter(
      (row) => row.data.state === 'fulfilled',
    ).length,
    openCorrections: corrections.filter((row) => row.data.state === 'open')
      .length,
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        version: 'result-impact-v2',
        groups: groupImpact.fingerprint,
        roundId: round.id,
        facts: inputs.fingerprint,
        rankingPolicy: competition.rules.ranking,
        revisions: revisions.map((row) => ({
          id: row.id,
          revision: row.data.resultRevision,
          status: row.data.status,
        })),
        changes,
        beforeRanks,
        afterRanks,
        pools: affectedPools.map((row) => ({
          id: row.id,
          revision: row.revision,
        })),
        proposals: proposals.map((row) => ({
          id: row.id,
          revision: row.revision,
          state: row.data.state,
          fingerprint: row.data.preview.fingerprint,
        })),
        corrections: corrections.map((row) => ({
          id: row.id,
          revision: row.revision,
          state: row.data.state,
        })),
      }),
    )
    .digest('hex');
  return {
    round,
    fingerprint,
    factsFingerprint: inputs.fingerprint,
    settled: inputs.settled,
    issues: inputs.issues,
    changes,
    rankings,
    rankingPolicy: competition.rules.ranking,
    groupImpact,
    prizes,
  };
}
