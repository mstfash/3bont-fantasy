import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  providerCollectionSchema,
  providerRequestSchema,
  type ProviderRequest,
} from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
import {
  assignedFixture,
  collectionInterval,
} from './provider-collection-plan.ts';
export interface CollectionLease {
  readonly batchId: string;
  readonly claimId: string;
  readonly allowSynthetic: boolean;
}
/** Lock order after the identity barrier: provider account -> schedule -> batch -> fixture. */
export async function authorizeCollectionReservation(
  tx: Transaction<Database>,
  lease: CollectionLease,
  accountId: string,
  request: ProviderRequest,
  now: Date,
) {
  const reference = await tx
    .selectFrom('provider_collection_batches')
    .select('schedule_id')
    .where('id', '=', lease.batchId)
    .executeTakeFirst();
  if (!reference) throw new CommandRejected('provider-collection-unavailable');
  const config = await tx
    .selectFrom('provider_schedules')
    .selectAll()
    .where('id', '=', reference.schedule_id)
    .forShare()
    .executeTakeFirstOrThrow();
  const row = await tx
    .selectFrom('provider_collection_batches')
    .selectAll()
    .where('id', '=', lease.batchId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const batch = providerCollectionSchema.parse(row.data);
  if (
    row.claim_id !== lease.claimId ||
    !row.claimed_until ||
    row.claimed_until <= now ||
    !['queued', 'collecting'].includes(batch.state)
  )
    throw new CommandRejected('provider-collection-lease-lost');
  if (
    config.account_id !== accountId ||
    !config.data.enabled ||
    config.revision !== batch.scheduleRevision
  )
    throw new CommandRejected('provider-collection-settings-changed');
  if (
    batch.startedAt &&
    now.getTime() - Date.parse(batch.startedAt) >= 10 * 60_000
  )
    throw new CommandRejected('provider-collection-expired');
  const fixture = await tx
    .selectFrom('fixtures')
    .innerJoin('seasons', 'seasons.id', 'fixtures.season_id')
    .select(['fixtures.data as fixture', 'seasons.data as season'])
    .where('fixtures.id', '=', batch.fixtureId)
    .forShare('fixtures')
    .executeTakeFirstOrThrow();
  if (fixture.season.synthetic && !lease.allowSynthetic)
    throw new CommandRejected('provider-synthetic-live-traffic-blocked');
  if (
    fixture.fixture.kickoff !== batch.fixtureKickoff ||
    collectionInterval(config.data, fixture.fixture, now) === null ||
    !(await assignedFixture(tx, batch.fixtureId))
  )
    throw new CommandRejected('provider-collection-fixture-changed');
  const mapping = await tx
    .selectFrom('provider_identities')
    .selectAll()
    .where('id', '=', batch.mappingId)
    .executeTakeFirst();
  if (
    !mapping ||
    mapping.revision !== batch.mappingRevision ||
    mapping.data.state !== 'active' ||
    mapping.entity_id !== batch.fixtureId ||
    mapping.binding_id !== config.binding_id
  )
    throw new CommandRejected('provider-collection-mapping-changed');
  const expected = batch.requests[batch.step];
  if (
    !expected ||
    JSON.stringify(providerRequestSchema.parse(expected)) !==
      JSON.stringify(providerRequestSchema.parse(request))
  )
    throw new CommandRejected('provider-collection-request-changed');
  const attempts = await tx
    .selectFrom('provider_collection_attempts')
    .innerJoin(
      'provider_attempts',
      'provider_attempts.id',
      'provider_collection_attempts.attempt_id',
    )
    .select([
      'provider_attempts.outcome',
      'provider_attempts.reserved_at',
      'provider_attempts.finished_at',
    ])
    .where('batch_id', '=', batch.id)
    .where('step', '=', batch.step)
    .orderBy('reserved_at', 'desc')
    .execute();
  if (attempts.some((attempt) => attempt.outcome === 'success'))
    throw new CommandRejected('provider-collection-step-complete');
  if (attempts.length >= 3)
    throw new CommandRejected('provider-collection-retries-exhausted');
  if (
    attempts.some(
      (attempt) =>
        attempt.finished_at === null &&
        now.getTime() - attempt.reserved_at.getTime() < 35_000,
    )
  )
    throw new CommandRejected('provider-collection-attempt-pending');
  return batch;
}
export async function lockCollectionIdentities(tx: Transaction<Database>) {
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'provider-identity-mapping'},0))`.execute(
    tx,
  );
}
