import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { competitionSchema, type Gameweek } from '@fantasy/contracts';
import { calculatePrizeResultImpact } from './prize-result-impact.ts';
import { calculateGroupResultImpact } from './group-result-impact.ts';
import { calculateRoundResultProjection } from './round-result-projection.ts';
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
  const projection = await calculateRoundResultProjection(tx, round);
  const { inputs, changes, replacement } = projection;
  const [beforeRanks, pools, revisions] = await Promise.all([
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
  const afterRanks =
    replacement !== null
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
    replacement,
  );
  const affectedPools = pools.filter((pool) =>
    pool.data.gameweekIds.includes(round.id),
  );
  const prizeImpacts = [];
  for (const pool of affectedPools)
    prizeImpacts.push(
      await calculatePrizeResultImpact(tx, pool.data, round, projection),
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
        version: 'result-impact-v3',
        prizeImpacts: prizeImpacts.map((p) => p.fingerprint),
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
    prizeImpacts,
  };
}
