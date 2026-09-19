import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import type { Gameweek, PrizePool } from '@fantasy/contracts';
import { calculateRoundInputs } from './round-inputs.ts';
import type { calculateRoundResultProjection } from './round-result-projection.ts';
import {
  addPrizeRoundResults,
  calculatePrizeAllocation,
  loadPrizeEligibility,
  loadPrizeResultTotals,
} from './prize-allocation-inputs.ts';
import { CommandRejected } from './errors.ts';

type Replacement = Awaited<ReturnType<typeof calculateRoundResultProjection>>;
/** Read-only estimate; it cannot prepare, approve, fulfill or overwrite an award decision. */
export async function calculatePrizeResultImpact(
  tx: Transaction<Database>,
  pool: PrizePool,
  round: Gameweek,
  replacement: Replacement,
) {
  if (
    pool.state !== 'published' ||
    pool.competitionId !== round.competitionId ||
    !pool.gameweekIds.includes(round.id)
  )
    throw new CommandRejected('prize-correction-outside-window');
  const [roundRows, reviewRows, proposals] = await Promise.all([
    tx
      .selectFrom('gameweeks')
      .select('data')
      .where('id', 'in', pool.gameweekIds)
      .orderBy('number')
      .execute(),
    tx
      .selectFrom('result_reviews')
      .select(['id', 'gameweek_id', 'reason'])
      .where('gameweek_id', 'in', pool.gameweekIds)
      .where('status', '=', 'open')
      .orderBy('id')
      .execute(),
    tx
      .selectFrom('prize_proposals')
      .select('data')
      .where('pool_id', '=', pool.id)
      .orderBy('id')
      .execute(),
  ]);
  const rounds = roundRows.map((r) => r.data);
  const eligibility = await loadPrizeEligibility(tx, pool, rounds);
  const publishedTotals = await loadPrizeResultTotals(tx, pool);
  const holds: string[] = [];
  if (
    rounds.length !== pool.gameweekIds.length ||
    rounds.some((r) => r.resultRevision < 1)
  )
    holds.push('round-results-unavailable');
  if (
    rounds.some(
      (r) =>
        r.id !== round.id && (r.status !== 'finalized' || r.issues.length > 0),
    )
  )
    holds.push('prize-results-not-final');
  if (reviewRows.some((r) => r.gameweek_id !== round.id))
    holds.push('prize-results-under-review');
  const evidence = [];
  for (const other of rounds.filter((r) => r.id !== round.id)) {
    const current = await calculateRoundInputs(tx, other);
    const published = await tx
      .selectFrom('round_calculations')
      .select('payload')
      .where('gameweek_id', '=', other.id)
      .where('revision', '=', other.resultRevision)
      .executeTakeFirst();
    evidence.push({
      gameweekId: other.id,
      current: current.fingerprint,
      published: published?.payload.fingerprint ?? null,
    });
    if (
      !current.settled ||
      !published?.payload.settled ||
      current.fingerprint !== published.payload.fingerprint
    )
      holds.push('prize-facts-changed');
  }
  const before = holds.includes('round-results-unavailable')
    ? null
    : calculatePrizeAllocation(pool, rounds, eligibility, publishedTotals);
  if (!replacement.inputs.settled || replacement.replacement === null)
    holds.push('correction-incomplete');
  const after =
    holds.length || replacement.replacement === null
      ? null
      : calculatePrizeAllocation(
          pool,
          rounds,
          eligibility,
          addPrizeRoundResults(
            await loadPrizeResultTotals(tx, pool, round.id),
            replacement.replacement,
          ),
        );
  if (after) holds.push(...after.issues);
  const recorded = proposals
    .map((r) => r.data)
    .filter((p) => p.state !== 'voided')
    .map((p) => ({
      id: p.id,
      revision: p.revision,
      state: p.state,
      preview: p.preview,
    }));
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        version: 'prize-result-impact-v1',
        pool,
        rounds,
        reviewRows,
        evidence,
        eligibility,
        publishedTotals,
        facts: replacement.inputs.fingerprint,
        before,
        after,
        holds,
        proposals: proposals.map((p) => p.data),
      }),
    )
    .digest('hex');
  return {
    fingerprint,
    pool: { id: pool.id, name: pool.name, currency: pool.currency },
    before: before?.issues.length ? null : before,
    beforeIssues: before?.issues ?? ['round-results-unavailable'],
    after: holds.length ? null : after,
    holds: [...new Set(holds)],
    recorded,
  };
}
