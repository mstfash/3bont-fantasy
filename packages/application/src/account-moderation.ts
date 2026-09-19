import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  accountModerationCommandSchema,
  accountModerationResultSchema,
  staffRoleSchema,
  type AccountModerationCommand,
} from '@fantasy/contracts';
import {
  AccessDenied,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function executeAccountModeration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: AccountModerationCommand,
) {
  const command = accountModerationCommandSchema.parse(input);
  requireCapability(
    principal,
    grants,
    'moderation.manage',
    null,
    new Date(),
    true,
  );
  if (command.accountId === principal.accountId)
    throw new CommandRejected('account-cannot-suspend-self');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    // Coordinate with grants/revocations so suspension cannot race a new privileged role.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-management'},0))`.execute(
      tx,
    );
    const actor = await tx
      .selectFrom('accounts')
      .select(['suspended_until', 'closed_at'])
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    const current = await tx
      .selectFrom('staff_grants')
      .select(['role', 'competition_id'])
      .where('account_id', '=', principal.accountId)
      .execute();
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (
      !actor ||
      !now ||
      actor.closed_at !== null ||
      (actor.suspended_until && actor.suspended_until > now)
    )
      throw new AccessDenied();
    requireCapability(
      principal,
      current.map((g) => ({
        role: staffRoleSchema.parse(g.role),
        competitionId: g.competition_id,
      })),
      'moderation.manage',
      null,
      now,
      true,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return accountModerationResultSchema.parse(cached.result);
    }
    const target = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', command.accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!target || target.closed_at !== null)
      throw new CommandRejected('account-unavailable');
    if (
      (target.suspended_until?.toISOString() ?? null) !==
      command.expectedSuspendedUntil
    )
      throw new CommandRejected('account-moderation-changed');
    if (
      await tx
        .selectFrom('staff_grants')
        .select('id')
        .where('account_id', '=', command.accountId)
        .executeTakeFirst()
    )
      throw new CommandRejected('account-staff-protected');
    const until = command.until ? new Date(command.until) : null;
    if (
      until &&
      (until <= now || until.getTime() > now.getTime() + 365 * 86400_000)
    )
      throw new CommandRejected('account-suspension-window');
    await tx
      .updateTable('accounts')
      .set({ suspended_until: until })
      .where('id', '=', command.accountId)
      .execute();
    await tx
      .deleteFrom('staff_session_proofs')
      .where('account_id', '=', command.accountId)
      .execute();
    await sql`DELETE FROM "session" WHERE "userId"=${command.accountId}`.execute(
      tx,
    );
    const result = {
      accountId: command.accountId,
      suspendedUntil: until?.toISOString() ?? null,
    };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: until ? 'account.suspend' : 'account.restore',
        scope_id: null,
        reason: command.reason,
        payload: {
          accountId: command.accountId,
          before: command.expectedSuspendedUntil,
          after: result.suspendedUntil,
          evidenceReference: command.evidenceReference,
        },
      })
      .execute();
    return result;
  });
}
export async function readAccountModeration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  search: string,
) {
  requireCapability(principal, grants, 'moderation.manage', null, new Date());
  const query = search.trim().slice(0, 100);
  const accounts = await db
    .selectFrom('accounts')
    .select(['id', 'display_name', 'suspended_until', 'closed_at'])
    .where((eb) =>
      eb.or([eb('id', '=', query), eb('display_name', 'ilike', `%${query}%`)]),
    )
    .orderBy('created_at', 'desc')
    .limit(20)
    .execute();
  const ids = accounts.map((a) => a.id),
    staff = ids.length
      ? await db
          .selectFrom('staff_grants')
          .select('account_id')
          .where('account_id', 'in', ids)
          .execute()
      : [];
  return accounts.map((a) => ({
    id: a.id,
    displayName: a.display_name,
    suspendedUntil: a.suspended_until?.toISOString() ?? null,
    closedAt: a.closed_at?.toISOString() ?? null,
    staff: staff.some((g) => g.account_id === a.id),
  }));
}
