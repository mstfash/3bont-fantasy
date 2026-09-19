import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  fixtureSchema,
  providerNormalizationSelectionSchema,
  type ProviderAcceptancePolicy,
  type ProviderCollection,
} from '@fantasy/contracts';
import { CLASSIC_SCORING_RULES, scoreFixture } from '@fantasy/domain';
import { loadProviderNormalization } from './provider-normalization.ts';
import { CommandRejected } from './errors.ts';

/** Policy-approved eligibility still requires every listed participant to have explicit usable facts. */
export async function loadAutomaticReport(
  tx: Transaction<Database>,
  batch: ProviderCollection,
  policy: ProviderAcceptancePolicy,
  now: Date,
) {
  const mapping = await tx
    .selectFrom('provider_identities')
    .select('data')
    .where('id', '=', batch.mappingId)
    .executeTakeFirst();
  if (
    !mapping ||
    mapping.data.state !== 'active' ||
    mapping.data.revision !== batch.mappingRevision ||
    mapping.data.bindingId !== policy.bindingId ||
    mapping.data.entityId !== batch.fixtureId
  )
    throw new CommandRejected('acceptance-mapping-changed');
  const attempts = await tx
    .selectFrom('provider_collection_attempts')
    .innerJoin(
      'provider_attempts',
      'provider_attempts.id',
      'provider_collection_attempts.attempt_id',
    )
    .select([
      'provider_collection_attempts.step',
      'provider_attempts.id',
      'provider_attempts.finished_at',
      'provider_attempts.account_id',
    ])
    .where('batch_id', '=', batch.id)
    .where('provider_attempts.outcome', '=', 'success')
    .where('provider_attempts.http_status', '=', 200)
    .distinctOn('provider_collection_attempts.step')
    .orderBy('provider_collection_attempts.step')
    .orderBy('provider_attempts.finished_at', 'desc')
    .execute();
  const byStep = new Map(attempts.map((a) => [a.step, a]));
  if (
    attempts.length !== 4 ||
    attempts.some(
      (a) => a.account_id !== policy.accountId || a.finished_at === null,
    )
  )
    throw new CommandRejected('normalization-evidence-unavailable');
  const oldest = Math.min(
    ...attempts.map((a) => a.finished_at?.getTime() ?? NaN),
  );
  const latest = Math.max(
    ...attempts.map((a) => a.finished_at?.getTime() ?? NaN),
  );
  if (
    !Number.isFinite(oldest) ||
    !Number.isFinite(latest) ||
    latest > now.getTime() ||
    now.getTime() - oldest > policy.maximumSourceAgeMinutes * 60000
  )
    throw new CommandRejected('acceptance-source-expired');
  const selection = providerNormalizationSelectionSchema.parse({
    fixtureId: batch.fixtureId,
    fixtureAttemptId: byStep.get(0)?.id,
    playersAttemptId: byStep.get(1)?.id,
    lineupsAttemptId: byStep.get(2)?.id,
    eventsAttemptId: byStep.get(3)?.id,
  });
  const normalized = await loadProviderNormalization(tx, selection);
  if (
    policy.adapterVersion !== normalized.adapterVersion ||
    normalized.binding.id !== policy.bindingId
  )
    throw new CommandRejected('acceptance-adapter-changed');
  const usedMapping = normalized.mappings.find((m) => m.id === batch.mappingId);
  if (
    !usedMapping ||
    usedMapping.state !== 'active' ||
    usedMapping.revision !== batch.mappingRevision ||
    usedMapping.entityId !== batch.fixtureId
  )
    throw new CommandRejected('acceptance-mapping-changed');
  const checkedAt = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (
    !checkedAt ||
    latest > checkedAt.getTime() ||
    checkedAt.getTime() - oldest > policy.maximumSourceAgeMinutes * 60000
  )
    throw new CommandRejected('acceptance-source-expired');
  const current = fixtureSchema.parse(
    (
      await tx
        .selectFrom('fixtures')
        .select('data')
        .where('id', '=', batch.fixtureId)
        .executeTakeFirstOrThrow()
    ).data,
  );
  const lastReport = await tx
    .selectFrom('fixture_observations')
    .innerJoin(
      'provider_evidence',
      'provider_evidence.id',
      'fixture_observations.evidence_id',
    )
    .select('provider_evidence.received_at')
    .where('fixture_id', '=', batch.fixtureId)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  const watermark = await tx
    .selectFrom('provider_acceptances')
    .select('source_at')
    .where('fixture_id', '=', batch.fixtureId)
    .where('state', '=', 'accepted')
    .orderBy('source_at', 'desc')
    .executeTakeFirst();
  if (
    latest <
    Math.max(
      lastReport?.received_at.getTime() ?? 0,
      watermark?.source_at?.getTime() ?? 0,
    )
  )
    throw new CommandRejected('acceptance-source-superseded');
  const ids = normalized.observation.eligibleFootballerIds;
  const players = ids.length
    ? await tx
        .selectFrom('footballers')
        .select('data')
        .where('id', 'in', ids)
        .execute()
    : [];
  if (!ids.length || players.length !== ids.length)
    throw new CommandRejected('footballer-outside-season');
  const byId = new Map(players.map((p) => [p.data.id, p.data]));
  // This single advisory is discharged by the owner's explicit season coverage policy.
  // Every sporting-data issue remains blocking, including missing bench statistics.
  const issues = normalized.issues.filter(
    (i) => i !== 'eligibility-needs-evidence',
  );
  for (const performance of normalized.observation.performances) {
    const footballer = byId.get(performance.footballerId);
    if (!footballer) throw new CommandRejected('footballer-outside-season');
    const result = scoreFixture(
      {
        ...performance,
        fixtureId: batch.fixtureId,
        factRevision: normalized.fingerprint,
        position: footballer.defaultPosition,
      },
      CLASSIC_SCORING_RULES,
    );
    if (result.status === 'blocked')
      issues.push(
        ...result.issues.map(
          (i) => `${performance.footballerId}:${i.code}:${i.path}`,
        ),
      );
  }
  return {
    current,
    normalized,
    sourceAt: new Date(latest),
    issues: [...new Set(issues)].sort(),
  };
}
