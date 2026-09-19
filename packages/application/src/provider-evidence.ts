import type { createDatabase } from '@fantasy/persistence';
import { idSchema } from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
/** Saved transport evidence is diagnostic data, never executable markup or normalized fantasy facts. */
export async function readProviderEvidence(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  attemptId: string,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  idSchema.parse(attemptId);
  const row = await db
    .selectFrom('provider_attempts')
    .innerJoin(
      'provider_accounts',
      'provider_accounts.id',
      'provider_attempts.account_id',
    )
    .leftJoin(
      'provider_evidence',
      'provider_evidence.id',
      'provider_attempts.evidence_id',
    )
    .select([
      'provider_attempts.id',
      'provider_attempts.request',
      'provider_attempts.reserved_at',
      'provider_attempts.finished_at',
      'provider_attempts.outcome',
      'provider_attempts.http_status',
      'provider_attempts.response_checksum',
      'provider_evidence.id as evidenceId',
      'provider_evidence.received_at',
      'provider_evidence.payload',
    ])
    .where('provider_attempts.id', '=', attemptId)
    .where('provider_accounts.provider', '=', 'api-football-direct')
    .executeTakeFirst();
  if (!row) return null;
  return {
    attemptId: row.id,
    request: row.request,
    startedAt: row.reserved_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    outcome: row.outcome,
    httpStatus: row.http_status,
    transportChecksum: row.response_checksum,
    evidence:
      row.evidenceId && row.received_at
        ? {
            id: row.evidenceId,
            firstStoredAt: row.received_at.toISOString(),
            payload: row.payload,
          }
        : null,
  };
}
