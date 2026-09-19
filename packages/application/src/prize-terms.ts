import { sql, type Transaction } from 'kysely';
import {
  prizePoolSchema,
  type PrizePool,
  type PrizeCommand,
  type Competition,
} from '@fantasy/contracts';
import type { Database } from '@fantasy/persistence';
import { CommandRejected } from './errors.ts';
export async function validatePrizeTerms(
  tx: Transaction<Database>,
  competition: Competition,
  terms: Extract<PrizeCommand, { kind: 'create' | 'update' }>,
) {
  const rounds = await tx
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', competition.id)
    .orderBy('number')
    .execute();
  const first = rounds.find((r) => r.data.id === terms.firstGameweekId)?.data,
    last = rounds.find((r) => r.data.id === terms.lastGameweekId)?.data;
  if (!first || !last || first.number > last.number)
    throw new CommandRejected('prize-invalid-interval');
  if (Date.parse(terms.eligibilityCutoff) > Date.parse(first.deadline))
    throw new CommandRejected('prize-cutoff-after-opening');
  if (terms.groupId) {
    const group = await tx
      .selectFrom('league_groups')
      .select('data')
      .where('id', '=', terms.groupId)
      .where('competition_id', '=', competition.id)
      .executeTakeFirst();
    if (!group) throw new CommandRejected('group-unavailable');
    const groupStart = rounds.find(
      (r) => r.data.id === group.data.startGameweekId,
    )?.data.number;
    if (groupStart && first.number < groupStart)
      throw new CommandRejected('prize-invalid-interval');
  }
  if (
    terms.places.reduce(
      (sum, r) =>
        sum +
        (r.kind === 'cash' ? r.amountMinor : (r.cashEquivalentMinor ?? 0)),
      0,
    ) > 1_000_000_000_000
  )
    throw new CommandRejected('prize-budget-too-large');
  return {
    first,
    rounds: rounds
      .filter(
        (r) => r.data.number >= first.number && r.data.number <= last.number,
      )
      .map((r) => r.data.id),
  };
}
export async function publishPrizeTerms(
  tx: Transaction<Database>,
  pool: PrizePool,
  evidenceReference: string,
): Promise<PrizePool> {
  if (pool.state !== 'draft') throw new CommandRejected('prize-terms-frozen');
  const rounds = await tx
    .selectFrom('gameweeks')
    .select('data')
    .where('id', 'in', pool.gameweekIds)
    .orderBy('number')
    .execute();
  const first = rounds[0]?.data;
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (
    !now ||
    !first ||
    rounds.some((r) => r.data.status !== 'upcoming') ||
    Date.parse(pool.eligibilityCutoff) <= now.getTime() ||
    Date.parse(first.deadline) <= now.getTime() ||
    Date.parse(pool.eligibilityCutoff) > Date.parse(first.deadline)
  )
    throw new CommandRejected('prize-publication-closed');
  return prizePoolSchema.parse({
    ...pool,
    state: 'published',
    revision: pool.revision + 1,
    publishedAt: now.toISOString(),
    evidenceReference,
  });
}
