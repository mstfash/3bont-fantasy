import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerAcceptancePolicySchema,
  providerAcceptanceSchema,
  providerCollectionSchema,
  fixtureObservationSchema,
  type ProviderAcceptance,
} from '@fantasy/contracts';
import { applyFixtureObservation } from './fixture-observations.ts';
import { loadAutomaticReport } from './provider-acceptance-inputs.ts';
import { CommandRejected } from './errors.ts';

/** Worker-only entry point. No HTTP is performed; the deployment switch gates its caller. */
export async function acceptNextProviderReport(
  db: ReturnType<typeof createDatabase>,
) {
  const candidate = await db
    .selectFrom('provider_collection_batches as b')
    .innerJoin('provider_schedules as s', 's.id', 'b.schedule_id')
    .innerJoin(
      'provider_acceptance_policies as p',
      'p.binding_id',
      's.binding_id',
    )
    .innerJoin('provider_accounts as account', 'account.id', 'p.account_id')
    .select(['b.id', 's.id as scheduleId', 'p.binding_id', 'p.account_id'])
    .where('b.state', '=', 'complete')
    .where(sql<boolean>`(p.data->>'enabled')::boolean`, '=', true)
    .where(sql<boolean>`(s.data->>'enabled')::boolean`, '=', true)
    .where(sql<string>`account.data->>'state'`, '=', 'enabled')
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('provider_acceptances as a')
            .select('a.batch_id')
            .whereRef('a.batch_id', '=', 'b.id')
            .whereRef('a.policy_revision', '=', 'p.revision'),
        ),
      ),
    )
    .orderBy('b.planned_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!candidate) return null;
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'provider-acceptance-policy'},0))`.execute(
      tx,
    );
    const policyRow = await tx
      .selectFrom('provider_acceptance_policies')
      .select('data')
      .where('binding_id', '=', candidate.binding_id)
      .executeTakeFirst();
    if (
      !policyRow ||
      !policyRow.data.enabled ||
      policyRow.data.accountId !== candidate.account_id
    )
      return null;
    const policy = providerAcceptancePolicySchema.parse(policyRow.data);
    // Same account → schedule → batch order as collection configuration and reservation.
    const account = await tx
      .selectFrom('provider_accounts')
      .select('data')
      .where('id', '=', policy.accountId)
      .forShare()
      .executeTakeFirst();
    const schedule = await tx
      .selectFrom('provider_schedules')
      .select('data')
      .where('id', '=', candidate.scheduleId)
      .forShare()
      .executeTakeFirst();
    if (!account || account.data.state !== 'enabled' || !schedule?.data.enabled)
      return null;
    const row = await tx
      .selectFrom('provider_collection_batches')
      .select('data')
      .where('id', '=', candidate.id)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!row || row.data.state !== 'complete') return null;
    const batch = providerCollectionSchema.parse(row.data);
    const existing = await tx
      .selectFrom('provider_acceptances')
      .select('data')
      .where('batch_id', '=', batch.id)
      .where('policy_revision', '=', policy.revision)
      .executeTakeFirst();
    if (existing) return null;
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    let outcome: Pick<
      ProviderAcceptance,
      | 'state'
      | 'sourceAt'
      | 'reportEvidenceId'
      | 'fixtureRevision'
      | 'normalizationFingerprint'
      | 'issues'
    > = {
      state: 'held',
      sourceAt: null,
      reportEvidenceId: null,
      fixtureRevision: null,
      normalizationFingerprint: null,
      issues: [],
    };
    try {
      if (
        schedule.data.revision !== batch.scheduleRevision ||
        schedule.data.accountId !== policy.accountId ||
        schedule.data.bindingId !== policy.bindingId
      )
        throw new CommandRejected('acceptance-schedule-changed');
      const report = await loadAutomaticReport(tx, batch, policy, now);
      outcome = {
        ...outcome,
        sourceAt: report.sourceAt.toISOString(),
        normalizationFingerprint: report.normalized.fingerprint,
        issues: report.issues,
      };
      if (!report.issues.length) {
        const observation = fixtureObservationSchema.parse({
          ...report.normalized.observation,
          eligibilityComplete: true,
          fixture: {
            ...report.normalized.observation.fixture,
            factsComplete: true,
          },
        });
        const saved = await applyFixtureObservation(
          tx,
          `provider:${policy.accountId}`,
          report.current,
          {
            observation,
            expectedRevision: observation.fixture.revision,
            source: 'api-football-direct',
            reason: `Automatic report under reviewed policy ${policy.bindingId}:${String(policy.revision)}`,
          },
          {
            kind: 'automatic-provider-report',
            normalization: report.normalized,
            eligibilityReference: policy.eligibilityEvidenceReference,
            policy: {
              bindingId: policy.bindingId,
              revision: policy.revision,
              adapterVersion: policy.adapterVersion,
            },
          },
        );
        outcome = {
          ...outcome,
          state: 'accepted',
          reportEvidenceId: saved.evidenceId,
          fixtureRevision: saved.fixture.revision,
        };
      }
    } catch (error) {
      if (error instanceof CommandRejected)
        outcome = { ...outcome, issues: [error.code] };
      else if (error instanceof z.ZodError)
        outcome = { ...outcome, issues: ['normalization-source-invalid'] };
      else throw error;
    }
    const decidedAt = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!decidedAt) throw new Error('Database clock unavailable');
    const record = providerAcceptanceSchema.parse({
      batchId: batch.id,
      fixtureId: batch.fixtureId,
      policy,
      decidedAt: decidedAt.toISOString(),
      ...outcome,
    });
    await tx
      .insertInto('provider_acceptances')
      .values({
        batch_id: batch.id,
        policy_revision: policy.revision,
        fixture_id: batch.fixtureId,
        report_evidence_id: record.reportEvidenceId,
        state: record.state,
        source_at: record.sourceAt ? new Date(record.sourceAt) : null,
        decided_at: decidedAt,
        data: record,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: `provider:${policy.accountId}`,
        action: `provider.report-${record.state}`,
        scope_id: batch.fixtureId,
        reason: 'Reviewed automatic report policy',
        payload: {
          batchId: batch.id,
          policyRevision: policy.revision,
          reportEvidenceId: record.reportEvidenceId,
          normalizationFingerprint: record.normalizationFingerprint,
          issues: record.issues,
        },
      })
      .execute();
    return record;
  });
}
