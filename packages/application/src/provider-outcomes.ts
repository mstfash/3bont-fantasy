import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import { CommandRejected } from './errors.ts';
export interface ProviderOutcome {
  readonly outcome: Exclude<Database['provider_attempts']['outcome'], null>;
  readonly status: number | null;
  readonly checksum: string | null;
  readonly payload?: unknown;
  readonly dailyRemaining: number | null;
  readonly dailyLimit: number | null;
  readonly minuteRemaining: number | null;
  readonly minuteLimit: number | null;
  readonly retryAfterSeconds: number | null;
}
export async function recordProviderOutcome(
  db: ReturnType<typeof createDatabase>,
  attemptId: string,
  outcome: ProviderOutcome,
) {
  return db.transaction().execute(async (tx) => {
    const reference = await tx
      .selectFrom('provider_attempts')
      .select('account_id')
      .where('id', '=', attemptId)
      .executeTakeFirst();
    if (!reference) throw new CommandRejected('provider-attempt-unavailable');
    const account = await tx
      .selectFrom('provider_accounts')
      .selectAll()
      .where('id', '=', reference.account_id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const attempt = await tx
      .selectFrom('provider_attempts')
      .selectAll()
      .where('id', '=', attemptId)
      .executeTakeFirstOrThrow();
    if (attempt.finished_at) return { evidenceId: attempt.evidence_id };
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const budget = await tx
      .selectFrom('provider_quota_windows')
      .selectAll()
      .where('account_id', '=', account.id)
      .where('starts_at', '=', attempt.window_start)
      .executeTakeFirstOrThrow();
    // Keep headers conservative: old higher remaining values never restore spent allowance.
    const ceiling = Math.min(
      budget.ceiling,
      outcome.dailyLimit ?? budget.ceiling,
      budget.used + (outcome.dailyRemaining ?? budget.ceiling),
    );
    await tx
      .updateTable('provider_quota_windows')
      .set({
        ceiling: Math.max(1, ceiling),
        ordinary_ceiling: Math.min(
          budget.ordinary_ceiling,
          Math.floor(ceiling * 0.9),
        ),
      })
      .where('account_id', '=', account.id)
      .where('starts_at', '=', attempt.window_start)
      .execute();
    const oldHeadroom =
      account.minute_headroom_until && account.minute_headroom_until > now
        ? account.minute_headroom
        : null;
    const headroom =
      outcome.minuteRemaining === null
        ? oldHeadroom
        : Math.min(
            oldHeadroom ?? outcome.minuteRemaining,
            outcome.minuteRemaining,
          );
    const headroomUntil =
      outcome.minuteRemaining !== null &&
      (oldHeadroom === null || outcome.minuteRemaining < oldHeadroom)
        ? new Date(now.getTime() + 65000)
        : account.minute_headroom_until;
    const minuteLimit =
      outcome.minuteLimit !== null && outcome.minuteLimit > 0
        ? Math.min(
            account.observed_minute_limit ?? outcome.minuteLimit,
            outcome.minuteLimit,
          )
        : account.observed_minute_limit;
    const success = outcome.outcome === 'success',
      failures = success ? 0 : account.consecutive_failures + 1;
    let pause = account.cooldown_until?.getTime() ?? 0;
    if (outcome.outcome === 'rate-limited')
      pause = Math.max(
        pause,
        now.getTime() +
          Math.max(65, Math.min(86400, outcome.retryAfterSeconds ?? 65)) * 1000,
      );
    else if (!success)
      pause = Math.max(
        pause,
        now.getTime() +
          (failures >= 3
            ? 300000
            : Math.min(60000, 2000 * 2 ** Math.min(failures, 5))),
      );
    if (outcome.minuteRemaining === 0)
      pause = Math.max(pause, now.getTime() + 65000);
    let evidenceId: string | null = null;
    if (outcome.payload !== undefined && outcome.checksum) {
      const previous = await tx
        .selectFrom('provider_evidence')
        .select('id')
        .where('provider', '=', 'api-football-direct')
        .where('resource', '=', attempt.request_fingerprint)
        .where('checksum', '=', outcome.checksum)
        .executeTakeFirst();
      evidenceId = previous?.id ?? randomUUID();
      if (!previous)
        await tx
          .insertInto('provider_evidence')
          .values({
            id: evidenceId,
            provider: 'api-football-direct',
            resource: attempt.request_fingerprint,
            received_at: now,
            checksum: outcome.checksum,
            payload: outcome.payload,
          })
          .execute();
    }
    await tx
      .updateTable('provider_attempts')
      .set({
        finished_at: now,
        outcome: outcome.outcome,
        http_status: outcome.status,
        response_checksum: outcome.checksum,
        evidence_id: evidenceId,
      })
      .where('id', '=', attempt.id)
      .execute();
    await tx
      .updateTable('provider_accounts')
      .set({
        minute_headroom: headroom,
        minute_headroom_until: headroomUntil,
        observed_minute_limit: minuteLimit,
        consecutive_failures: failures,
        cooldown_until: pause > 0 ? new Date(pause) : null,
        last_success_at: success ? now : account.last_success_at,
        last_error_code: success ? null : outcome.outcome,
        ...(account.inflight_attempt_id === attempt.id
          ? { inflight_attempt_id: null, inflight_until: null }
          : {}),
      })
      .where('id', '=', account.id)
      .execute();
    return { evidenceId };
  });
}
