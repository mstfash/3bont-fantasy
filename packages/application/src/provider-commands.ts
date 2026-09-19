import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerAccountSchema,
  providerCommandSchema,
  providerCommandResultSchema,
  staffRoleSchema,
  type ProviderCommand,
} from '@fantasy/contracts';
import {
  AccessDenied,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { providerQuotaWindow } from './provider-quota.ts';
export async function executeProviderCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ProviderCommand,
) {
  const command = providerCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-management'},0))`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'provider-account-configuration'},0))`.execute(
      tx,
    );
    const row = await tx
      .selectFrom('provider_accounts')
      .selectAll()
      .where('provider', '=', 'api-football-direct')
      .forUpdate()
      .executeTakeFirst();
    const actor = await tx
      .selectFrom('accounts')
      .select(['suspended_until', 'closed_at'])
      .where('id', '=', principal.accountId)
      .forShare()
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
      !now ||
      !actor ||
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
      'facts.manage',
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
      return providerCommandResultSchema.parse(cached.result);
    }
    if ((row?.revision ?? 0) !== command.expectedRevision)
      throw new CommandRejected('provider-settings-changed');
    if (!row && command.kind !== 'configure')
      throw new CommandRejected('provider-unavailable');
    let account;
    if (command.kind === 'configure') {
      if (Date.parse(command.resetAnchor) > now.getTime())
        throw new CommandRejected('provider-reset-unverified');
      if (
        row?.data.resetAnchor &&
        row.data.resetAnchor !== command.resetAnchor
      ) {
        const prior = providerQuotaWindow(row.data.resetAnchor, now);
        const used = await tx
          .selectFrom('provider_quota_windows')
          .select('used')
          .where('account_id', '=', row.id)
          .where('starts_at', '=', prior.starts)
          .executeTakeFirst();
        if (used && used.used > 0)
          throw new CommandRejected('provider-reset-in-use');
      }
      account = providerAccountSchema.parse({
        id: row?.id ?? randomUUID(),
        provider: 'api-football-direct',
        revision: (row?.revision ?? 0) + 1,
        state: 'paused',
        dailyLimit: command.dailyLimit,
        minuteLimit: command.minuteLimit,
        resetAnchor: command.resetAnchor,
        evidenceReference: command.evidenceReference,
        dedicatedKeyConfirmed: true,
        reconciledAt: null,
      });
      if (row)
        await tx
          .updateTable('provider_accounts')
          .set({
            revision: account.revision,
            data: account,
            observed_minute_limit: null,
          })
          .where('id', '=', account.id)
          .execute();
      else
        await tx
          .insertInto('provider_accounts')
          .values({
            id: account.id,
            provider: account.provider,
            revision: account.revision,
            data: account,
            minute_headroom: null,
            minute_headroom_until: null,
            observed_minute_limit: null,
            inflight_attempt_id: null,
            cooldown_until: null,
            inflight_until: null,
            next_dispatch_at: null,
            last_success_at: null,
            last_error_code: null,
          })
          .execute();
    } else {
      if (!row) throw new CommandRejected('provider-unavailable');
      if (command.kind === 'pause')
        account = providerAccountSchema.parse({
          ...row.data,
          revision: row.revision + 1,
          state: 'paused',
          reconciledAt: null,
        });
      else {
        if (
          !row.data.resetAnchor ||
          !row.data.dailyLimit ||
          !row.data.minuteLimit ||
          !row.data.dedicatedKeyConfirmed
        )
          throw new CommandRejected('provider-quota-unverified');
        const window = providerQuotaWindow(row.data.resetAnchor, now);
        if (window.starts.toISOString() !== command.windowStart)
          throw new CommandRejected('provider-window-changed');
        const existing = await tx
          .selectFrom('provider_quota_windows')
          .selectAll()
          .where('account_id', '=', row.id)
          .where('starts_at', '=', window.starts)
          .executeTakeFirst();
        if (command.usedToday < (existing?.used ?? 0))
          throw new CommandRejected('provider-usage-cannot-decrease');
        const ceiling = Math.min(
            existing?.ceiling ?? row.data.dailyLimit,
            row.data.dailyLimit,
          ),
          ordinaryCeiling = Math.min(
            existing?.ordinary_ceiling ?? Math.floor(ceiling * 0.9),
            Math.floor(ceiling * 0.9),
          );
        await tx
          .insertInto('provider_quota_windows')
          .values({
            account_id: row.id,
            starts_at: window.starts,
            ends_at: window.ends,
            ceiling,
            ordinary_ceiling: ordinaryCeiling,
            used: command.usedToday,
            ordinary_used: Math.max(
              existing?.ordinary_used ?? 0,
              command.usedToday,
            ),
          })
          .onConflict((oc) =>
            oc.columns(['account_id', 'starts_at']).doUpdateSet({
              ceiling,
              ordinary_ceiling: ordinaryCeiling,
              used: command.usedToday,
              ordinary_used: Math.max(
                existing?.ordinary_used ?? 0,
                command.usedToday,
              ),
            }),
          )
          .execute();
        account = providerAccountSchema.parse({
          ...row.data,
          revision: row.revision + 1,
          state: 'enabled',
          evidenceReference: command.evidenceReference,
          reconciledAt: now.toISOString(),
        });
      }
      await tx
        .updateTable('provider_accounts')
        .set({
          revision: account.revision,
          data: account,
          ...(command.kind === 'reconcile'
            ? {
                cooldown_until: new Date(
                  Math.max(
                    now.getTime() + 65000,
                    row.cooldown_until?.getTime() ?? 0,
                  ),
                ),
              }
            : {}),
        })
        .where('id', '=', row.id)
        .execute();
    }
    const result = { account };
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
        action: `provider.${command.kind}`,
        scope_id: account.id,
        reason: command.reason,
        payload: {
          before: row?.data ?? null,
          after: account,
          ...(command.kind === 'reconcile'
            ? { usedToday: command.usedToday, windowStart: command.windowStart }
            : {}),
        },
      })
      .execute();
    return result;
  });
}
