import {
  authorizeCollectionReservation,
  lockCollectionIdentities,
  type CollectionLease,
} from './provider-collection-reservation.ts';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerAccountSchema,
  providerRequestSchema,
  type ProviderRequest,
} from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
export const providerDispatchLeaseMs = 5000;
/** A fixed 24-hour provider window is anchored to a verified reset instant, never assumed to be Cairo midnight. */
export function providerQuotaWindow(anchor: string, now: Date) {
  const base = Date.parse(anchor);
  if (!Number.isFinite(base) || base > now.getTime())
    throw new CommandRejected('provider-reset-unverified');
  const starts = new Date(
    base + Math.floor((now.getTime() - base) / 86400_000) * 86400_000,
  );
  return { starts, ends: new Date(starts.getTime() + 86400_000) };
}
/** Worker-only reservation. Every retry/page receives a different attempt ID; an old ID never authorizes another send. */
export async function reserveProviderAttempt(
  db: ReturnType<typeof createDatabase>,
  input: {
    accountId: string;
    attemptId: string;
    request: ProviderRequest;
    priority: 'ordinary' | 'correction';
    collection?: CollectionLease;
  },
) {
  const request = providerRequestSchema.parse(input.request);
  return db.transaction().execute(async (tx) => {
    if (input.collection) await lockCollectionIdentities(tx);
    const row = await tx
      .selectFrom('provider_accounts')
      .selectAll()
      .where('id', '=', input.accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new CommandRejected('provider-unavailable');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const account = providerAccountSchema.parse(row.data);
    if (input.collection && input.priority !== 'ordinary')
      throw new CommandRejected('provider-collection-ordinary-only');
    const collection = input.collection
      ? await authorizeCollectionReservation(
          tx,
          input.collection,
          account.id,
          request,
          now,
        )
      : null;
    if (
      account.state !== 'enabled' ||
      !account.dailyLimit ||
      !account.minuteLimit ||
      !account.resetAnchor ||
      !account.evidenceReference ||
      !account.dedicatedKeyConfirmed ||
      !account.reconciledAt
    )
      throw new CommandRejected('provider-quota-unverified');
    if (
      (row.cooldown_until && row.cooldown_until > now) ||
      (row.inflight_until && row.inflight_until > now) ||
      (row.next_dispatch_at && row.next_dispatch_at > now)
    )
      throw new CommandRejected('provider-backoff');
    const minuteLimit = Math.min(
      account.minuteLimit,
      row.observed_minute_limit ?? account.minuteLimit,
    );
    const headroom =
      row.minute_headroom_until && row.minute_headroom_until > now
        ? row.minute_headroom
        : null;
    if (headroom !== null && headroom <= 0)
      throw new CommandRejected('provider-minute-limit');
    const window = providerQuotaWindow(account.resetAnchor, now);
    // No lease can cross a daily reset: the reservation belongs to the actual dispatch window.
    if (window.ends.getTime() - now.getTime() <= providerDispatchLeaseMs)
      throw new CommandRejected('provider-reset-near');
    const old = await tx
      .selectFrom('provider_attempts')
      .select('id')
      .where('id', '=', input.attemptId)
      .executeTakeFirst();
    if (old) throw new CommandRejected('provider-attempt-already-reserved');
    await tx
      .insertInto('provider_quota_windows')
      .values({
        account_id: account.id,
        starts_at: window.starts,
        ends_at: window.ends,
        ceiling: account.dailyLimit,
        ordinary_ceiling: Math.floor(account.dailyLimit * 0.9),
        used: 0,
        ordinary_used: 0,
      })
      .onConflict((oc) => oc.columns(['account_id', 'starts_at']).doNothing())
      .execute();
    const budget = await tx
      .selectFrom('provider_quota_windows')
      .selectAll()
      .where('account_id', '=', account.id)
      .where('starts_at', '=', window.starts)
      .executeTakeFirstOrThrow();
    const ceiling = Math.min(budget.ceiling, account.dailyLimit),
      ordinaryCeiling = Math.min(
        budget.ordinary_ceiling,
        Math.floor(account.dailyLimit * 0.9),
      );
    if (
      budget.used >= ceiling ||
      (input.priority === 'ordinary' && budget.ordinary_used >= ordinaryCeiling)
    )
      throw new CommandRejected('provider-daily-limit');
    const recent = await tx
      .selectFrom('provider_attempts')
      .select(tx.fn.countAll<string>().as('count'))
      .where('account_id', '=', account.id)
      .where(
        'reserved_at',
        '>',
        new Date(now.getTime() - 60000 - providerDispatchLeaseMs),
      )
      .executeTakeFirstOrThrow();
    if (Number(recent.count) >= minuteLimit)
      throw new CommandRejected('provider-minute-limit');
    const expires = new Date(now.getTime() + providerDispatchLeaseMs),
      fingerprint = createHash('sha256')
        .update(JSON.stringify(request))
        .digest('hex');
    await tx
      .updateTable('provider_quota_windows')
      .set({
        ceiling,
        ordinary_ceiling: ordinaryCeiling,
        used: budget.used + 1,
        ordinary_used:
          budget.ordinary_used + (input.priority === 'ordinary' ? 1 : 0),
      })
      .where('account_id', '=', account.id)
      .where('starts_at', '=', window.starts)
      .execute();
    await tx
      .insertInto('provider_attempts')
      .values({
        id: input.attemptId,
        account_id: account.id,
        window_start: window.starts,
        request,
        request_fingerprint: fingerprint,
        priority: input.priority,
        reserved_at: now,
        dispatch_expires_at: expires,
        finished_at: null,
        outcome: null,
        http_status: null,
        response_checksum: null,
        evidence_id: null,
      })
      .execute();
    if (collection) {
      await tx
        .insertInto('provider_collection_attempts')
        .values({
          batch_id: collection.id,
          step: collection.step,
          attempt_id: input.attemptId,
        })
        .execute();
      await tx
        .updateTable('provider_collection_batches')
        .set({
          state: 'collecting',
          data: {
            ...collection,
            state: 'collecting',
            startedAt: collection.startedAt ?? now.toISOString(),
            code: null,
          },
        })
        .where('id', '=', collection.id)
        .execute();
    }
    await tx
      .updateTable('provider_accounts')
      .set({
        minute_headroom: headroom === null ? null : headroom - 1,
        inflight_attempt_id: input.attemptId,
        inflight_until: new Date(now.getTime() + 30000),
        next_dispatch_at: new Date(
          now.getTime() + Math.ceil(60000 / minuteLimit),
        ),
      })
      .where('id', '=', account.id)
      .execute();
    return {
      attemptId: input.attemptId,
      accountId: account.id,
      reservedAt: now,
      dispatchExpiresAt: expires,
      windowStart: window.starts,
      request,
    };
  });
}
