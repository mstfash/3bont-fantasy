import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  prizeCorrectionCommandSchema,
  prizeCorrectionResultSchema,
  prizeCorrectionCaseSchema,
  staffRoleSchema,
  type PrizeCorrectionCommand,
} from '@fantasy/contracts';
import {
  AccessDenied,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { observePrizeCorrection } from './prize-correction-observation.ts';
export async function executePrizeCorrection(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: PrizeCorrectionCommand,
) {
  const command = prizeCorrectionCommandSchema.parse(input);
  requireCapability(
    principal,
    grants,
    'prizes.approve',
    command.competitionId,
    new Date(),
    true,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    // Same lock as role changes/suspensions: authority cannot be revoked halfway through resolution.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-management'},0))`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const competition = await tx
      .selectFrom('competitions')
      .select('id')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!competition) throw new CommandRejected('competition-unavailable');
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
      !actor ||
      !now ||
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
      'prizes.approve',
      command.competitionId,
      now,
      true,
    );
    const receipt = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return prizeCorrectionResultSchema.parse(receipt.result);
    }
    const row = await tx
      .selectFrom('prize_correction_cases')
      .select('data')
      .where('id', '=', command.caseId)
      .where('competition_id', '=', command.competitionId)
      .executeTakeFirst();
    if (!row) throw new CommandRejected('prize-correction-unavailable');
    const review = row.data;
    if (review.state !== 'open' || review.revision !== command.expectedRevision)
      throw new CommandRejected('prize-correction-changed');
    const proposal = (
      await tx
        .selectFrom('prize_proposals')
        .select('data')
        .where('id', '=', review.proposalId)
        .executeTakeFirstOrThrow()
    ).data;
    const pool = (
      await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('id', '=', review.poolId)
        .executeTakeFirstOrThrow()
    ).data;
    const observation = await observePrizeCorrection(tx, pool);
    if (
      command.expectedFingerprint !== review.observation.fingerprint ||
      observation.fingerprint !== command.expectedFingerprint
    )
      throw new CommandRejected('prize-correction-changed');
    if (!observation.preview || observation.hold)
      throw new CommandRejected('prize-correction-unsettled');
    if (
      [...proposal.preview.awards, ...observation.preview.awards].some(
        (a) => a.accountId === principal.accountId,
      )
    )
      throw new CommandRejected('prize-self-award');
    if (proposal.preparedBy === principal.accountId)
      throw new CommandRejected('prize-distinct-approver-required');
    const data = prizeCorrectionCaseSchema.parse({
      ...review,
      revision: review.revision + 1,
      state: 'resolved',
      updatedAt: now.toISOString(),
      resolution: {
        decision: command.decision,
        reason: command.reason,
        reference: command.reference,
        actorId: principal.accountId,
        resolvedAt: now.toISOString(),
      },
    });
    await tx
      .updateTable('prize_correction_cases')
      .set({ revision: data.revision, data })
      .where('id', '=', data.id)
      .execute();
    const result = { caseId: data.id, revision: data.revision };
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
        action: 'prize.correction-resolved',
        scope_id: pool.id,
        reason: command.reason,
        payload: {
          caseId: data.id,
          revision: data.revision,
          proposalId: proposal.id,
          fingerprint: observation.fingerprint,
          resolution: data.resolution,
        },
      })
      .execute();
    return result;
  });
}
