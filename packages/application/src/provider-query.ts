import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { providerQuotaWindow } from './provider-quota.ts';
export async function readProviderAdministration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  const account = await db
    .selectFrom('provider_accounts')
    .selectAll()
    .where('provider', '=', 'api-football-direct')
    .executeTakeFirst();
  if (!account) return null;
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(db)
  ).rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  const interval = account.data.resetAnchor
    ? providerQuotaWindow(account.data.resetAnchor, now)
    : null;
  const budget = interval
    ? await db
        .selectFrom('provider_quota_windows')
        .selectAll()
        .where('account_id', '=', account.id)
        .where('starts_at', '=', interval.starts)
        .executeTakeFirst()
    : null;
  const attempts = await db
    .selectFrom('provider_attempts')
    .select([
      'id',
      'request',
      'priority',
      'reserved_at',
      'finished_at',
      'outcome',
      'http_status',
      'evidence_id',
    ])
    .where('account_id', '=', account.id)
    .orderBy('reserved_at', 'desc')
    .limit(50)
    .execute();
  return { account, interval, budget, attempts };
}
/** Required restore step before any worker or operator fetch is restarted. No consumed allowance is erased. */
export async function pauseProviderTrafficAfterRestore(
  db: ReturnType<typeof createDatabase>,
) {
  return db.transaction().execute(async (tx) => {
    const result =
      await sql`UPDATE fantasy.provider_accounts SET revision=revision+1,data=jsonb_set(jsonb_set(jsonb_set(data,'{state}','"paused"'::jsonb),'{reconciledAt}','null'::jsonb),'{revision}',to_jsonb(revision+1))`.execute(
        tx,
      );
    return Number(result.numAffectedRows ?? 0);
  });
}
