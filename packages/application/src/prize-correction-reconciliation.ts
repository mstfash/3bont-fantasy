import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { prizeCorrectionCaseSchema } from '@fantasy/contracts';
import {
  observePrizeCorrection,
  prizeEvidenceFingerprint,
} from './prize-correction-observation.ts';
import { CommandRejected } from './errors.ts';
export async function reconcilePrizeCorrections(
  db: ReturnType<typeof createDatabase>,
  competitionId?: string,
) {
  const proposals = await db
    .selectFrom('prize_proposals')
    .select(['id', 'competition_id'])
    .where(sql<string>`data->>'state'`, '=', 'fulfilled')
    .$if(competitionId !== undefined, (q) =>
      q.where('competition_id', '=', competitionId ?? ''),
    )
    .orderBy('id')
    .execute();
  let opened = 0,
    updated = 0;
  const failed: { proposalId: string; code: string }[] = [];
  for (const ref of proposals) {
    try {
      const result = await db.transaction().execute(async (tx) => {
        await tx
          .selectFrom('competitions')
          .select('id')
          .where('id', '=', ref.competition_id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const proposal = (
          await tx
            .selectFrom('prize_proposals')
            .select('data')
            .where('id', '=', ref.id)
            .executeTakeFirstOrThrow()
        ).data;
        const pool = (
          await tx
            .selectFrom('prize_pools')
            .select('data')
            .where('id', '=', proposal.poolId)
            .executeTakeFirstOrThrow()
        ).data;
        const observation = await observePrizeCorrection(tx, pool);
        const latest = (
          await tx
            .selectFrom('prize_correction_cases')
            .select('data')
            .where('proposal_id', '=', proposal.id)
            .orderBy(sql<string>`data->>'openedAt'`, 'desc')
            .orderBy('id', 'desc')
            .executeTakeFirst()
        )?.data;
        if (latest?.observation.fingerprint === observation.fingerprint)
          return null;
        if (
          !latest &&
          observation.fingerprint === prizeEvidenceFingerprint(proposal.preview)
        )
          return null;
        const now = (
          await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
        ).rows[0]?.now;
        if (!now) throw new Error('Database clock unavailable');
        const existing = latest?.state === 'open' ? latest : null;
        const data = prizeCorrectionCaseSchema.parse({
          id: existing?.id ?? randomUUID(),
          competitionId: pool.competitionId,
          poolId: pool.id,
          proposalId: proposal.id,
          revision: (existing?.revision ?? 0) + 1,
          state: 'open',
          openedAt: existing?.openedAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
          observation,
          resolution: null,
        });
        if (existing)
          await tx
            .updateTable('prize_correction_cases')
            .set({ revision: data.revision, data })
            .where('id', '=', data.id)
            .execute();
        else
          await tx
            .insertInto('prize_correction_cases')
            .values({
              id: data.id,
              competition_id: pool.competitionId,
              pool_id: pool.id,
              proposal_id: proposal.id,
              revision: data.revision,
              data,
            })
            .execute();
        await tx
          .insertInto('prize_correction_observations')
          .values({
            case_id: data.id,
            revision: data.revision,
            observed_at: now,
            payload: observation,
          })
          .execute();
        await tx
          .insertInto('audit_events')
          .values({
            id: randomUUID(),
            actor_id: 'system:prize-review',
            action: existing
              ? 'prize.correction-updated'
              : 'prize.correction-opened',
            scope_id: pool.id,
            reason: 'Post-fulfillment evidence changed',
            payload: {
              caseId: data.id,
              proposalId: proposal.id,
              revision: data.revision,
              previousFingerprint:
                latest?.observation.fingerprint ??
                prizeEvidenceFingerprint(proposal.preview),
              fingerprint: observation.fingerprint,
            },
          })
          .execute();
        return existing ? 'updated' : 'opened';
      });
      if (result === 'opened') opened++;
      if (result === 'updated') updated++;
    } catch (error) {
      failed.push({
        proposalId: ref.id,
        code:
          error instanceof CommandRejected
            ? error.code
            : 'prize-correction-failed',
      });
    }
  }
  return { inspected: proposals.length, opened, updated, failed };
}
