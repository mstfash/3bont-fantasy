import { calculateRoundInputs } from './round-inputs.ts';
import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { pointUnits } from '@fantasy/domain';
import {
  prizePreviewSchema,
  type PrizePool,
  type PrizePreview,
} from '@fantasy/contracts';
import type { Database } from '@fantasy/persistence';
import { CommandRejected } from './errors.ts';
import { allocatePrizeAwards } from './prize-allocation.ts';
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
  const memberships = pool.groupId
    ? await tx
        .selectFrom('group_membership_history')
        .distinctOn('entry_id')
        .select(['entry_id', 'status'])
        .where('group_id', '=', pool.groupId)
        .where('occurred_at', '<=', new Date(pool.eligibilityCutoff))
        .orderBy('entry_id')
        .orderBy('occurred_at', 'desc')
        .orderBy('sequence', 'desc')
        .execute()
    : null;
  const members = new Set(
    memberships?.filter((m) => m.status === 'active').map((m) => m.entry_id),
  );
  const entries = await tx
    .selectFrom('entries')
    .innerJoin('accounts', 'accounts.id', 'entries.account_id')
    .select(['entries.data', 'accounts.suspended_until', 'accounts.closed_at'])
    .where('competition_id', '=', pool.competitionId)
    .where(sql<string>`entries.data->>'status'`, '!=', 'draft')
    .orderBy('entries.id')
    .forShare('accounts')
    .execute();
  const ids = [...new Set(entries.map((e) => e.data.accountId))];
  const identity = ids.length
    ? await sql<{
        id: string;
        verified: boolean;
      }>`SELECT id,"emailVerified" AS verified FROM "user" WHERE id IN (${sql.join(ids)}) FOR SHARE`.execute(
        tx,
      )
    : { rows: [] };
  const verified = new Set(
    identity.rows.filter((u) => u.verified).map((u) => u.id),
  );
  // Closure preserves verified historical eligibility; retired entries still exclude future windows.
  for (const entry of entries)
    if (entry.closed_at !== null) verified.add(entry.data.accountId);
  const results = await tx
    .selectFrom('entry_results')
    .innerJoin('gameweeks', 'gameweeks.id', 'entry_results.gameweek_id')
    .select([
      'entry_results.entry_id',
      sql<string>`count(*)::text`.as('rounds'),
      sql<string>`sum((entry_results.payload->>'total')::bigint)::text`.as(
        'points',
      ),
      sql<string>`sum((entry_results.payload->>'transferDeduction')::bigint)::text`.as(
        'deductions',
      ),
      sql<string>`sum((entry_results.payload->>'goals')::bigint)::text`.as(
        'goals',
      ),
      sql<boolean>`bool_and((entry_results.payload->>'settled')::boolean)`.as(
        'settled',
      ),
    ])
    .where('entry_results.gameweek_id', 'in', pool.gameweekIds)
    .whereRef(
      'entry_results.revision',
      '=',
      sql<number>`(gameweeks.data->>'resultRevision')::integer`,
    )
    .groupBy('entry_results.entry_id')
    .execute();
  const resultByEntry = new Map(results.map((r) => [r.entry_id, r]));
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  const exclusions = await tx
    .selectFrom('prize_eligibility')
    .selectAll()
    .where('pool_id', '=', pool.id)
    .orderBy('account_id')
    .execute();
  const retirements = new Map(
    (
      await tx
        .selectFrom('entry_retirements')
        .select(['entry_id', 'retired_at'])
        .where('competition_id', '=', pool.competitionId)
        .execute()
    ).map((r) => [r.entry_id, r.retired_at]),
  );
  const candidates = entries
    .filter(
      (e) =>
        e.data.activatedAt !== null &&
        Date.parse(e.data.activatedAt) <= Date.parse(pool.eligibilityCutoff) &&
        (!pool.groupId || members.has(e.data.id)),
    )
    .map(({ data: e, suspended_until }) => {
      const score = resultByEntry.get(e.id);
      const reasons: string[] = [];
      if (exclusions.some((x) => x.account_id === e.accountId && x.excluded))
        reasons.push('eligibility-excluded');
      if (!verified.has(e.accountId)) reasons.push('email-not-verified');
      if (suspended_until && suspended_until > now)
        reasons.push('account-suspended');
      const retiredAt = retirements.get(e.id);
      const retiredDuringWindow =
        retiredAt !== undefined &&
        rounds.some((r) => Date.parse(r.data.deadline) > retiredAt.getTime());
      if (retiredDuringWindow) reasons.push('entry-retired-during-window');
      else if (
        !score ||
        Number(score.rounds) !== rounds.length ||
        !score.settled
      )
        reasons.push('incomplete-entry-results');
      return {
        entryId: e.id,
        accountId: e.accountId,
        entryName: e.name,
        points: pointUnits(Number(score?.points ?? 0)),
        transferDeductions: pointUnits(Number(score?.deductions ?? 0)),
        effectiveGoals: Number(score?.goals ?? 0),
        eligible: reasons.length === 0,
        reasons,
      };
    });
  const allocation = allocatePrizeAwards(pool, candidates);
  if (candidates.some((c) => c.reasons.includes('incomplete-entry-results')))
    allocation.issues.push('incomplete-entry-results');
  if (!candidates.some((c) => c.eligible))
    allocation.issues.push('no-eligible-entries');
  const value = {
    poolId: pool.id,
    revisions: rounds.map((r) => ({
      gameweekId: r.data.id,
      revision: r.data.resultRevision,
    })),
    candidates,
    ...allocation,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ pool, value, exclusions }))
    .digest('hex');
  return prizePreviewSchema.parse({ ...value, fingerprint });
}
