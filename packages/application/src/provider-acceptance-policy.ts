import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerAcceptanceCommandSchema,
  providerAcceptancePolicySchema,
  type ProviderAcceptanceCommand,
} from '@fantasy/contracts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import type { Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function executeProviderAcceptancePolicy(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: ProviderAcceptanceCommand,
) {
  const command = providerAcceptanceCommandSchema.parse(input);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'provider.acceptance.manage',
      null,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'provider-acceptance-policy'},0))`.execute(
      tx,
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
      return providerAcceptancePolicySchema.parse(cached.result);
    }
    const account = await tx
      .selectFrom('provider_accounts')
      .select('id')
      .where('id', '=', command.accountId)
      .executeTakeFirst();
    const binding = await tx
      .selectFrom('provider_season_bindings')
      .select('id')
      .where('id', '=', command.bindingId)
      .executeTakeFirst();
    if (!account || !binding)
      throw new CommandRejected('provider-binding-unavailable');
    const current = await tx
      .selectFrom('provider_acceptance_policies')
      .select('data')
      .where('binding_id', '=', command.bindingId)
      .executeTakeFirst();
    if ((current?.data.revision ?? 0) !== command.expectedRevision)
      throw new CommandRejected('provider-acceptance-changed');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const policy = providerAcceptancePolicySchema.parse({
      bindingId: command.bindingId,
      accountId: command.accountId,
      revision: command.expectedRevision + 1,
      enabled: command.enabled,
      adapterVersion: command.adapterVersion,
      maximumSourceAgeMinutes: command.maximumSourceAgeMinutes,
      eligibilityEvidenceReference: command.eligibilityEvidenceReference,
      updatedAt: now.toISOString(),
    });
    await tx
      .insertInto('provider_acceptance_policies')
      .values({
        binding_id: policy.bindingId,
        account_id: policy.accountId,
        revision: policy.revision,
        data: policy,
      })
      .onConflict((oc) =>
        oc.column('binding_id').doUpdateSet({
          account_id: policy.accountId,
          revision: policy.revision,
          data: policy,
        }),
      )
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'provider.acceptance-policy',
        scope_id: policy.bindingId,
        reason: command.reason,
        payload: {
          before: current?.data ?? null,
          after: policy,
          completeEligibilityConfirmed: command.completeEligibilityConfirmed,
        },
      })
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: policy,
      })
      .execute();
    return policy;
  });
}
