import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { staffRoleSchema } from '@fantasy/contracts';
import {
  AccessDenied,
  requireCapability,
  type Capability,
  type Principal,
} from './authorization.ts';
/** Acquire before any command/entity locks. Staff changes and closure take the exclusive counterpart. */
export async function loadCurrentStaffWriteContext(
  tx: Transaction<Database>,
  principal: Principal,
) {
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'staff-management'},0))`.execute(
    tx,
  );
  const account = await tx
    .selectFrom('accounts')
    .select(['closed_at', 'suspended_until'])
    .where('id', '=', principal.accountId)
    .executeTakeFirst();
  const grants = await tx
    .selectFrom('staff_grants')
    .select(['role', 'competition_id'])
    .where('account_id', '=', principal.accountId)
    .execute();
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (
    !account ||
    !now ||
    account.closed_at !== null ||
    (account.suspended_until && account.suspended_until > now)
  )
    throw new AccessDenied();
  return {
    now,
    grants: grants.map((g) => ({
      role: staffRoleSchema.parse(g.role),
      competitionId: g.competition_id,
    })),
  };
}
export async function requireCurrentStaffWrite(
  tx: Transaction<Database>,
  principal: Principal,
  capability: Capability,
  competitionId: string | null,
) {
  const context = await loadCurrentStaffWriteContext(tx, principal);
  requireCapability(
    principal,
    context.grants,
    capability,
    competitionId,
    context.now,
    true,
  );
}
