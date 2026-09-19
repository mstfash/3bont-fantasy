import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  prizeCommandSchema,
  prizeCommandResultSchema,
  prizePoolSchema,
  prizeProposalSchema,
  type PrizeCommand,
  type PrizePool,
} from '@fantasy/contracts';
import type { createDatabase } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { calculatePrizePreview } from './prize-preview.ts';
import { validatePrizeTerms, publishPrizeTerms } from './prize-terms.ts';
import { transitionPrizeProposal } from './prize-transitions.ts';
export async function executePrizeCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: PrizeCommand,
) {
  const command = prizeCommandSchema.parse(input);
  const capability =
    command.kind === 'approve' ? 'prizes.approve' : 'prizes.prepare';
  requireCapability(
    principal,
    grants,
    capability,
    command.competitionId,
    new Date(),
    true,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      capability,
      command.competitionId,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
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
      return prizeCommandResultSchema.parse(cached.result);
    }
    const competition = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!competition || competition.data.status === 'archived')
      throw new CommandRejected('competition-unavailable');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    let result: { poolId: string; proposalId: string | null };
    let audit: object;
    if (command.kind === 'create' || command.kind === 'update') {
      const interval = await validatePrizeTerms(tx, competition.data, command);
      const existing =
        command.kind === 'update'
          ? await tx
              .selectFrom('prize_pools')
              .select('data')
              .where('id', '=', command.poolId)
              .where('competition_id', '=', command.competitionId)
              .executeTakeFirst()
          : null;
      if (
        command.kind === 'update' &&
        (!existing || existing.data.revision !== command.expectedRevision)
      )
        throw new CommandRejected('prize-pool-changed');
      if (existing && existing.data.state !== 'draft')
        throw new CommandRejected('prize-terms-frozen');
      const season = await tx
        .selectFrom('seasons')
        .select('data')
        .where('id', '=', competition.data.seasonId)
        .executeTakeFirstOrThrow();
      const pool = prizePoolSchema.parse({
        id: existing?.data.id ?? randomUUID(),
        competitionId: command.competitionId,
        revision: (existing?.data.revision ?? 0) + 1,
        name: command.name,
        description: command.description,
        firstGameweekId: command.firstGameweekId,
        lastGameweekId: command.lastGameweekId,
        groupId: command.groupId,
        eligibilityCutoff: command.eligibilityCutoff,
        currency: command.currency,
        places: command.places,
        oneAwardPerAccount: command.oneAwardPerAccount,
        state: 'draft',
        synthetic: season.data.synthetic,
        gameweekIds: interval.rounds,
        publishedAt: null,
        evidenceReference: null,
        ranking: interval.first.rules.ranking,
      });
      await tx
        .insertInto('prize_pools')
        .values({
          id: pool.id,
          competition_id: pool.competitionId,
          group_id: pool.groupId,
          revision: pool.revision,
          data: pool,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            group_id: pool.groupId,
            revision: pool.revision,
            data: pool,
          }),
        )
        .execute();
      result = { poolId: pool.id, proposalId: null };
      audit = { pool };
    } else {
      const proposal =
        'proposalId' in command
          ? await tx
              .selectFrom('prize_proposals')
              .select('data')
              .where('id', '=', command.proposalId)
              .where('competition_id', '=', command.competitionId)
              .executeTakeFirst()
          : null;
      const poolId =
        'poolId' in command ? command.poolId : proposal?.data.poolId;
      if (!poolId) throw new CommandRejected('prize-proposal-unavailable');
      const stored = await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('id', '=', poolId)
        .where('competition_id', '=', command.competitionId)
        .executeTakeFirst();
      if (!stored) throw new CommandRejected('prize-pool-unavailable');
      const pool: PrizePool = stored.data;
      if ('poolId' in command && pool.revision !== command.expectedRevision)
        throw new CommandRejected('prize-pool-changed');
      if (command.kind === 'publish') {
        if (!['published', 'running'].includes(competition.data.status))
          throw new CommandRejected('competition-unavailable');
        const published = await publishPrizeTerms(
          tx,
          pool,
          command.evidenceReference,
        );
        await tx
          .updateTable('prize_pools')
          .set({ revision: published.revision, data: published })
          .where('id', '=', pool.id)
          .execute();
        result = { poolId: pool.id, proposalId: null };
        audit = { pool: published };
      } else if (command.kind === 'eligibility') {
        const target = await tx
          .selectFrom('entries')
          .select('id')
          .where('competition_id', '=', pool.competitionId)
          .where('account_id', '=', command.accountId)
          .executeTakeFirst();
        if (!target) throw new CommandRejected('prize-account-outside-pool');
        if (principal.accountId === command.accountId)
          throw new CommandRejected('prize-self-award');
        const decision = {
          pool_id: pool.id,
          account_id: command.accountId,
          excluded: command.excluded,
          reason: command.reason,
          evidence_reference: command.evidenceReference,
          reviewed_by: principal.accountId,
          reviewed_at: now,
        };
        await tx
          .insertInto('prize_eligibility')
          .values(decision)
          .onConflict((oc) =>
            oc.columns(['pool_id', 'account_id']).doUpdateSet(decision),
          )
          .execute();
        const updated = { ...pool, revision: pool.revision + 1 };
        await tx
          .updateTable('prize_pools')
          .set({ data: updated, revision: updated.revision })
          .where('id', '=', pool.id)
          .execute();
        result = { poolId: pool.id, proposalId: null };
        audit = { decision };
      } else if (command.kind === 'prepare') {
        const active = await tx
          .selectFrom('prize_proposals')
          .select('id')
          .where('pool_id', '=', pool.id)
          .where(sql<string>`data->>'state'`, '!=', 'voided')
          .executeTakeFirst();
        if (active) throw new CommandRejected('prize-proposal-already-exists');
        const preview = await calculatePrizePreview(tx, pool);
        if (preview.fingerprint !== command.expectedFingerprint)
          throw new CommandRejected('prize-preview-changed');
        if (preview.issues.length)
          throw new CommandRejected('prize-proposal-blocked');
        if (preview.awards.some((a) => a.accountId === principal.accountId))
          throw new CommandRejected('prize-self-award');
        const prepared = prizeProposalSchema.parse({
          id: randomUUID(),
          poolId: pool.id,
          competitionId: pool.competitionId,
          revision: 1,
          preview,
          state: 'prepared',
          preparedBy: principal.accountId,
          preparedAt: now.toISOString(),
          reviewedBy: null,
          reviewedAt: null,
          approvedBy: null,
          approvedAt: null,
          fulfilledBy: null,
          fulfilledAt: null,
          fulfillmentReference: null,
        });
        await tx
          .insertInto('prize_proposals')
          .values({
            id: prepared.id,
            pool_id: pool.id,
            competition_id: pool.competitionId,
            revision: 1,
            data: prepared,
          })
          .execute();
        result = { poolId: pool.id, proposalId: prepared.id };
        audit = { proposal: prepared };
      } else {
        if (!proposal) throw new CommandRejected('prize-proposal-unavailable');
        const updated = await transitionPrizeProposal(
          tx,
          pool,
          proposal.data,
          command,
          principal.accountId,
          now,
        );
        await tx
          .updateTable('prize_proposals')
          .set({ revision: updated.revision, data: updated })
          .where('id', '=', updated.id)
          .execute();
        result = { poolId: pool.id, proposalId: updated.id };
        audit = { before: proposal.data, after: updated };
      }
    }
    requireCapability(
      principal,
      grants,
      capability,
      command.competitionId,
      new Date(),
      true,
    );
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
        action: `prize.${command.kind}`,
        scope_id: result.poolId,
        reason: command.reason,
        payload: audit,
      })
      .execute();
    return result;
  });
}
