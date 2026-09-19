import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerScheduleCommandSchema,
  providerScheduleSchema,
  type ProviderScheduleCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { CommandRejected } from './errors.ts';

export async function executeProviderScheduleCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ProviderScheduleCommand,
) {
  const command = providerScheduleCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
    const account = await tx
      .selectFrom('provider_accounts')
      .select('id')
      .where('id', '=', command.accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!account) throw new CommandRejected('provider-unavailable');
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return providerScheduleSchema.parse(cached.result);
    }
    const binding = await tx
      .selectFrom('provider_season_bindings')
      .select('id')
      .where('id', '=', command.bindingId)
      .executeTakeFirst();
    if (!binding) throw new CommandRejected('provider-binding-unavailable');
    const previous = await tx
      .selectFrom('provider_schedules')
      .select('data')
      .where('binding_id', '=', binding.id)
      .forUpdate()
      .executeTakeFirst();
    if ((previous?.data.revision ?? 0) !== command.expectedRevision)
      throw new CommandRejected('provider-schedule-changed');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const schedule = providerScheduleSchema.parse({
      id: previous?.data.id ?? randomUUID(),
      accountId: account.id,
      bindingId: binding.id,
      revision: (previous?.data.revision ?? 0) + 1,
      enabled: command.enabled,
      liveIntervalMinutes: command.liveIntervalMinutes,
      correctionIntervalMinutes: command.correctionIntervalMinutes,
      beforeKickoffMinutes: command.beforeKickoffMinutes,
      activeHours: command.activeHours,
      correctionHours: command.correctionHours,
      evidenceReference: command.evidenceReference,
      updatedAt: now.toISOString(),
    });
    await tx
      .insertInto('provider_schedules')
      .values({
        id: schedule.id,
        account_id: schedule.accountId,
        binding_id: schedule.bindingId,
        revision: schedule.revision,
        data: schedule,
      })
      .onConflict((oc) =>
        oc
          .column('id')
          .doUpdateSet({ revision: schedule.revision, data: schedule }),
      )
      .execute();
    // Reserved attempts keep their quota charge; no pending batch may reserve against superseded settings.
    await sql`UPDATE fantasy.provider_collection_batches SET state='cancelled',claim_id=NULL,claimed_until=NULL,data=data||jsonb_build_object('state','cancelled','finishedAt',${now.toISOString()}::text,'code','schedule-changed') WHERE schedule_id=${schedule.id} AND state IN ('queued','collecting')`.execute(
      tx,
    );
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: schedule,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'provider.schedule-updated',
        scope_id: schedule.id,
        reason: command.reason,
        payload: { before: previous?.data ?? null, after: schedule },
      })
      .execute();
    return schedule;
  });
}

export async function readProviderSchedules(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const [account, bindings, schedules, batches] = await Promise.all([
        tx
          .selectFrom('provider_accounts')
          .select('data')
          .where('provider', '=', 'api-football-direct')
          .executeTakeFirst(),
        tx
          .selectFrom('provider_season_bindings')
          .innerJoin(
            'seasons',
            'seasons.id',
            'provider_season_bindings.season_id',
          )
          .select([
            'provider_season_bindings.data as binding',
            'seasons.data as season',
          ])
          .orderBy('provider_season_bindings.id')
          .execute(),
        tx
          .selectFrom('provider_schedules')
          .select('data')
          .orderBy('id')
          .execute(),
        tx
          .selectFrom('provider_collection_batches')
          .select(['data', 'next_attempt_at'])
          .orderBy('planned_at', 'desc')
          .limit(100)
          .execute(),
      ]);
      return {
        account: account?.data ?? null,
        bindings: bindings.map((row) => ({
          ...row,
          schedule:
            schedules.find(
              (schedule) => schedule.data.bindingId === row.binding.id,
            )?.data ?? null,
        })),
        batches,
      };
    });
}
