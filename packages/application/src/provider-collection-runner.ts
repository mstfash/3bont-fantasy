import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerCollectionSchema,
  type ProviderCollection,
} from '@fantasy/contracts';
import { fetchProviderResource } from './provider-gateway.ts';
import { CommandRejected } from './errors.ts';
type DB = ReturnType<typeof createDatabase>;
const transient = new Set([
  'provider-backoff',
  'provider-minute-limit',
  'provider-daily-limit',
  'provider-quota-unverified',
  'provider-reset-near',
  'provider-key-unavailable',
  'provider-collection-attempt-pending',
]);

async function settleCollection(
  db: DB,
  id: string,
  claimId: string,
  failure: string | null,
) {
  return db.transaction().execute(async (tx) => {
    const row = await tx
      .selectFrom('provider_collection_batches')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      row.claim_id !== claimId ||
      !['queued', 'collecting'].includes(row.state)
    )
      return row.data;
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const attempts = await tx
      .selectFrom('provider_collection_attempts')
      .innerJoin(
        'provider_attempts',
        'provider_attempts.id',
        'provider_collection_attempts.attempt_id',
      )
      .select(['provider_attempts.outcome', 'provider_attempts.finished_at'])
      .where('batch_id', '=', id)
      .where('step', '=', row.data.step)
      .execute();
    let data: ProviderCollection = row.data;
    const expired =
      data.startedAt !== null &&
      now.getTime() - Date.parse(data.startedAt) >= 10 * 60_000;
    if (expired)
      data = {
        ...data,
        state: 'held',
        code: 'provider-collection-expired',
        finishedAt: now.toISOString(),
      };
    else if (
      attempts.some(
        (attempt) =>
          attempt.outcome === 'success' && attempt.finished_at !== null,
      )
    ) {
      const step = data.step + 1;
      data = {
        ...data,
        step,
        state: step === 4 ? 'complete' : 'collecting',
        code: null,
        finishedAt: step === 4 ? now.toISOString() : null,
      };
    } else if (
      failure &&
      !transient.has(failure) &&
      failure !== 'provider-collection-step-complete'
    ) {
      data = {
        ...data,
        state: 'held',
        code: failure,
        finishedAt: now.toISOString(),
      };
    } else if (attempts.length >= 3) {
      data = {
        ...data,
        state: 'held',
        code: 'provider-collection-retries-exhausted',
        finishedAt: now.toISOString(),
      };
    } else
      data = {
        ...data,
        code: failure ?? 'provider-collection-response-unavailable',
      };
    data = providerCollectionSchema.parse(data);
    await tx
      .updateTable('provider_collection_batches')
      .set({
        state: data.state,
        data,
        claim_id: null,
        claimed_until: null,
        next_attempt_at: new Date(now.getTime() + (data.code ? 60_000 : 0)),
      })
      .where('id', '=', id)
      .execute();
    return data;
  });
}
/** One bounded dispatch per call; a paused provider never gets a new collection claim. */
export async function processNextProviderCollection(
  db: DB,
  apiKey: string,
  transport: typeof fetch = fetch,
) {
  const claim = await db.transaction().execute(async (tx) => {
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const row = await tx
      .selectFrom('provider_collection_batches')
      .innerJoin(
        'provider_schedules',
        'provider_schedules.id',
        'provider_collection_batches.schedule_id',
      )
      .innerJoin(
        'provider_accounts',
        'provider_accounts.id',
        'provider_schedules.account_id',
      )
      .select([
        'provider_collection_batches.data',
        'provider_collection_batches.id',
        'provider_schedules.account_id',
      ])
      .where('provider_collection_batches.state', 'in', [
        'queued',
        'collecting',
      ])
      .where('next_attempt_at', '<=', now)
      .where((eb) =>
        eb.or([
          eb('claimed_until', 'is', null),
          eb('claimed_until', '<=', now),
        ]),
      )
      .where(
        sql<boolean>`(provider_schedules.data->>'enabled')::boolean`,
        '=',
        true,
      )
      .where(sql<string>`provider_accounts.data->>'state'`, '=', 'enabled')
      .orderBy(
        sql<number>`CASE WHEN provider_collection_batches.state='collecting' THEN 0 ELSE 1 END`,
      )
      .orderBy('planned_at')
      .orderBy('provider_collection_batches.id')
      .forUpdate('provider_collection_batches')
      .skipLocked()
      .executeTakeFirst();
    if (!row) return null;
    const claimId = randomUUID();
    await tx
      .updateTable('provider_collection_batches')
      .set({
        claim_id: claimId,
        claimed_until: new Date(now.getTime() + 45_000),
      })
      .where('id', '=', row.id)
      .execute();
    const success = await tx
      .selectFrom('provider_collection_attempts')
      .innerJoin(
        'provider_attempts',
        'provider_attempts.id',
        'provider_collection_attempts.attempt_id',
      )
      .select('attempt_id')
      .where('batch_id', '=', row.id)
      .where('step', '=', row.data.step)
      .where('provider_attempts.outcome', '=', 'success')
      .executeTakeFirst();
    return { ...row, claimId, recover: !!success };
  });
  if (!claim)
    return {
      state: 'idle' as const,
      attempted: false,
      batchId: null,
      code: null,
    };
  let attempted = false,
    failure: string | null = null;
  if (!claim.recover) {
    const request = claim.data.requests[claim.data.step];
    if (!request) failure = 'provider-collection-request-changed';
    else
      try {
        await fetchProviderResource(
          db,
          {
            accountId: claim.account_id,
            request,
            priority: 'ordinary',
            apiKey,
            collection: { batchId: claim.id, claimId: claim.claimId },
          },
          transport,
        );
        attempted = true;
      } catch (error) {
        if (!(error instanceof CommandRejected)) throw error;
        failure = error.code;
      }
  }
  const batch = await settleCollection(db, claim.id, claim.claimId, failure);
  return { state: batch.state, attempted, batchId: batch.id, code: batch.code };
}
