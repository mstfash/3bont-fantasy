import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { pointUnits } from '@fantasy/domain';
import {
  prizePreviewSchema,
  type PrizePool,
  type PrizePreview,
  type Gameweek,
  type EntryResult,
} from '@fantasy/contracts';
import { allocatePrizeAwards } from './prize-allocation.ts';

/** Published revisions only; excluding one round supports an in-memory correction overlay. */
export async function loadPrizeResultTotals(
  tx: Transaction<Database>,
  pool: PrizePool,
  excludeGameweekId?: string,
) {
  return tx
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
    .$if(excludeGameweekId !== undefined, (q) =>
      q.where('entry_results.gameweek_id', '!=', excludeGameweekId ?? ''),
    )
    .whereRef(
      'entry_results.revision',
      '=',
      sql<number>`(gameweeks.data->>'resultRevision')::integer`,
    )
    .groupBy('entry_results.entry_id')
    .orderBy('entry_results.entry_id')
    .execute();
}

type PrizeResultTotals = Awaited<ReturnType<typeof loadPrizeResultTotals>>;

/** Capture eligibility once so published and projected allocations use the same identity state and clock. */
export async function loadPrizeEligibility(
  tx: Transaction<Database>,
  pool: PrizePool,
  rounds: readonly Gameweek[],
) {
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
      const reasons: string[] = [];
      if (exclusions.some((x) => x.account_id === e.accountId && x.excluded))
        reasons.push('eligibility-excluded');
      if (!verified.has(e.accountId)) reasons.push('email-not-verified');
      if (suspended_until && suspended_until > now)
        reasons.push('account-suspended');
      const retiredAt = retirements.get(e.id);
      const retiredDuringWindow =
        retiredAt !== undefined &&
        rounds.some((r) => Date.parse(r.deadline) > retiredAt.getTime());
      if (retiredDuringWindow) reasons.push('entry-retired-during-window');
      return {
        entryId: e.id,
        accountId: e.accountId,
        entryName: e.name,
        reasons,
      };
    });
  return { candidates, exclusions };
}

/** Shared allocation kernel. Finality authorization belongs to calculatePrizePreview, never this projection helper. */
export function calculatePrizeAllocation(
  pool: PrizePool,
  rounds: readonly Gameweek[],
  eligibility: Awaited<ReturnType<typeof loadPrizeEligibility>>,
  results: PrizeResultTotals,
): PrizePreview {
  const resultByEntry = new Map(results.map((row) => [row.entry_id, row]));
  const candidates = eligibility.candidates.map((entry) => {
    const score = resultByEntry.get(entry.entryId);
    const reasons = [...entry.reasons];
    if (
      !reasons.includes('entry-retired-during-window') &&
      (!score || Number(score.rounds) !== rounds.length || !score.settled)
    )
      reasons.push('incomplete-entry-results');
    return {
      entryId: entry.entryId,
      accountId: entry.accountId,
      entryName: entry.entryName,
      points: pointUnits(Number(score?.points ?? 0)),
      transferDeductions: pointUnits(Number(score?.deductions ?? 0)),
      effectiveGoals: Number(score?.goals ?? 0),
      eligible: reasons.length === 0,
      reasons,
    };
  });
  const exclusions = eligibility.exclusions;
  const allocation = allocatePrizeAwards(pool, candidates);
  if (candidates.some((c) => c.reasons.includes('incomplete-entry-results')))
    allocation.issues.push('incomplete-entry-results');
  if (!candidates.some((c) => c.eligible))
    allocation.issues.push('no-eligible-entries');
  const value = {
    poolId: pool.id,
    revisions: rounds.map((r) => ({
      gameweekId: r.id,
      revision: r.resultRevision,
    })),
    candidates,
    ...allocation,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ pool, value, exclusions }))
    .digest('hex');
  return prizePreviewSchema.parse({ ...value, fingerprint });
}

/** The caller has excluded the replaced round; preserve exact integer aggregates and completeness. */
export function addPrizeRoundResults(
  totals: PrizeResultTotals,
  replacement: ReadonlyMap<string, EntryResult>,
): PrizeResultTotals {
  const rows = new Map(totals.map((row) => [row.entry_id, { ...row }]));
  for (const [entryId, score] of replacement) {
    const before = rows.get(entryId);
    rows.set(entryId, {
      entry_id: entryId,
      rounds: String(Number(before?.rounds ?? 0) + 1),
      points: String(BigInt(before?.points ?? '0') + BigInt(score.total)),
      deductions: String(
        BigInt(before?.deductions ?? '0') + BigInt(score.transferDeduction),
      ),
      goals: String(BigInt(before?.goals ?? '0') + BigInt(score.goals)),
      settled: (before?.settled ?? true) && score.settled,
    });
  }
  return [...rows.values()];
}
