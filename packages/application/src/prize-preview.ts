import { calculateRoundInputs } from './round-inputs.ts';
import type { Transaction } from 'kysely';
import { type PrizePool, type PrizePreview } from '@fantasy/contracts';
import type { Database } from '@fantasy/persistence';
import { CommandRejected } from './errors.ts';
import {
  calculatePrizeAllocation,
  loadPrizeResultTotals,
  loadPrizeEligibility,
} from './prize-allocation-inputs.ts';
/** Parent competition must be locked by the caller so a result publication cannot race award decisions. */
export async function calculatePrizePreview(
  tx: Transaction<Database>,
  pool: PrizePool,
): Promise<PrizePreview> {
  if (pool.state !== 'published' || pool.gameweekIds.length === 0)
    throw new CommandRejected('prize-terms-not-published');
  const rounds = await tx
    .selectFrom('gameweeks')
    .select('data')
    .where('id', 'in', pool.gameweekIds)
    .orderBy('number')
    .execute();
  if (
    rounds.length !== pool.gameweekIds.length ||
    rounds.some(
      (r) =>
        r.data.status !== 'finalized' ||
        r.data.resultRevision < 1 ||
        r.data.issues.length > 0,
    )
  )
    throw new CommandRejected('prize-results-not-final');
  const open = await tx
    .selectFrom('result_reviews')
    .select('id')
    .where('gameweek_id', 'in', pool.gameweekIds)
    .where('status', '=', 'open')
    .executeTakeFirst();
  if (open) throw new CommandRejected('prize-results-under-review');
  const fixtureIds = await tx
    .selectFrom('fixture_assignments')
    .select('fixture_id')
    .where('gameweek_id', 'in', pool.gameweekIds)
    .execute();
  if (fixtureIds.length)
    await tx
      .selectFrom('fixtures')
      .select('id')
      .where(
        'id',
        'in',
        fixtureIds.map((f) => f.fixture_id),
      )
      .orderBy('id')
      .forShare()
      .execute();
  for (const { data: round } of rounds) {
    const published = await tx
      .selectFrom('round_calculations')
      .select('payload')
      .where('gameweek_id', '=', round.id)
      .where('revision', '=', round.resultRevision)
      .executeTakeFirst();
    const current = await calculateRoundInputs(tx, round);
    if (
      !published ||
      !published.payload.settled ||
      !current.settled ||
      published.payload.fingerprint !== current.fingerprint
    )
      throw new CommandRejected('prize-facts-changed');
  }
  const values = rounds.map((r) => r.data);
  const eligibility = await loadPrizeEligibility(tx, pool, values);
  return calculatePrizeAllocation(
    pool,
    values,
    eligibility,
    await loadPrizeResultTotals(tx, pool),
  );
}
