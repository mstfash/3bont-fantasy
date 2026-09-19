import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import type {
  PrizePreview,
  PrizePool,
  PrizeCorrectionObservation,
} from '@fantasy/contracts';
import { calculatePrizePreview } from './prize-preview.ts';
import { calculateRoundInputs } from './round-inputs.ts';
import { CommandRejected } from './errors.ts';
/** Cosmetic entry names do not create a correction or invalidate its resolution. */
export function prizeEvidenceFingerprint(preview: PrizePreview): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        poolId: preview.poolId,
        revisions: preview.revisions.map((r) => ({
          gameweekId: r.gameweekId,
          revision: r.revision,
        })),
        candidates: preview.candidates.map((c) => ({
          entryId: c.entryId,
          accountId: c.accountId,
          points: c.points,
          transferDeductions: c.transferDeductions,
          effectiveGoals: c.effectiveGoals,
          eligible: c.eligible,
          reasons: c.reasons,
        })),
        awards: preview.awards.map((a) => ({
          entryId: a.entryId,
          accountId: a.accountId,
          rank: a.rank,
          reward:
            a.reward.kind === 'cash'
              ? { kind: a.reward.kind, amountMinor: a.reward.amountMinor }
              : {
                  kind: a.reward.kind,
                  name: { ar: a.reward.name.ar, en: a.reward.name.en },
                  cashEquivalentMinor: a.reward.cashEquivalentMinor,
                },
        })),
        residueMinor: preview.residueMinor,
        unallocatedMinor: preview.unallocatedMinor,
        issues: preview.issues,
      }),
    )
    .digest('hex');
}
/** Caller holds the competition lock; calculatePrizePreview also locks eligible identities and fixture facts. */
export async function observePrizeCorrection(
  tx: Transaction<Database>,
  pool: PrizePool,
): Promise<PrizeCorrectionObservation> {
  try {
    const preview = await calculatePrizePreview(tx, pool);
    return {
      fingerprint: prizeEvidenceFingerprint(preview),
      preview,
      hold: preview.issues.length ? 'prize-proposal-blocked' : null,
    };
  } catch (error) {
    if (!(error instanceof CommandRejected)) throw error;
    const rounds = await tx
      .selectFrom('gameweeks')
      .select('data')
      .where('id', 'in', pool.gameweekIds)
      .orderBy('number')
      .execute();
    const evidence = [];
    for (const r of rounds) {
      const inputs = await calculateRoundInputs(tx, r.data);
      evidence.push({
        id: r.data.id,
        status: r.data.status,
        revision: r.data.resultRevision,
        fingerprint: inputs.fingerprint,
        issues: inputs.issues,
      });
    }
    return {
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ hold: error.code, evidence }))
        .digest('hex'),
      preview: null,
      hold: error.code,
    };
  }
}
