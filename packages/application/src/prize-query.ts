import { requirePrizeReader } from './prize-access.ts';
export { requirePrizeReader } from './prize-access.ts';
import { prizeEvidenceFingerprint } from './prize-correction-observation.ts';
import type { createDatabase } from '@fantasy/persistence';
import { type PrizePreview } from '@fantasy/contracts';
import {
  AccessDenied,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { calculatePrizePreview } from './prize-preview.ts';
import { requireGroupReader } from './group-access.ts';
type DB = ReturnType<typeof createDatabase>;
export async function readPrizeAdministration(
  db: DB,
  principal: Principal,
  grants: readonly StaffGrant[],
  poolId: string,
) {
  return db.transaction().execute(async (tx) => {
    const ref = await tx
      .selectFrom('prize_pools')
      .select('competition_id')
      .where('id', '=', poolId)
      .executeTakeFirst();
    if (!ref) throw new CommandRejected('prize-pool-unavailable');
    requirePrizeReader(principal, grants, ref.competition_id);
    const competition = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', ref.competition_id)
      .forShare()
      .executeTakeFirstOrThrow();
    const pool = (
      await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('id', '=', poolId)
        .executeTakeFirstOrThrow()
    ).data;
    const [proposalRows, rounds, groups, eligibilityReviews] =
      await Promise.all([
        tx
          .selectFrom('prize_proposals')
          .select('data')
          .where('pool_id', '=', poolId)
          .orderBy('id')
          .execute(),
        tx
          .selectFrom('gameweeks')
          .select('data')
          .where('competition_id', '=', pool.competitionId)
          .orderBy('number')
          .execute(),
        tx
          .selectFrom('league_groups')
          .select('data')
          .where('competition_id', '=', pool.competitionId)
          .orderBy('id')
          .execute(),
        tx
          .selectFrom('prize_eligibility')
          .selectAll()
          .where('pool_id', '=', pool.id)
          .orderBy('reviewed_at', 'desc')
          .execute(),
      ]);
    let preview: PrizePreview | null = null,
      hold: string | null = null;
    if (pool.state === 'published') {
      try {
        preview = await calculatePrizePreview(tx, pool);
      } catch (error) {
        if (error instanceof CommandRejected) hold = error.code;
        else throw error;
      }
    }
    const proposals = proposalRows.map((p) => p.data),
      active = proposals.find((p) => p.state !== 'voided');
    if (
      !hold &&
      active &&
      preview &&
      active.preview.fingerprint !== preview.fingerprint
    )
      hold = 'prize-proposal-stale';
    if (!hold && preview?.issues.length) hold = 'prize-proposal-blocked';
    const corrections = (
      await tx
        .selectFrom('prize_correction_cases')
        .select('data')
        .where('pool_id', '=', pool.id)
        .orderBy('id')
        .execute()
    ).map((r) => r.data);
    const latestCorrection = [...corrections].sort(
      (a, b) =>
        b.openedAt.localeCompare(a.openedAt) || b.id.localeCompare(a.id),
    )[0];
    if (active?.state === 'fulfilled' && preview && !preview.issues.length) {
      const currentFingerprint = prizeEvidenceFingerprint(preview);
      hold =
        latestCorrection?.state === 'open'
          ? 'prize-proposal-stale'
          : (latestCorrection?.observation.fingerprint ??
                prizeEvidenceFingerprint(active.preview)) === currentFingerprint
            ? null
            : 'prize-proposal-stale';
    }
    const observationHistory = corrections.length
      ? await tx
          .selectFrom('prize_correction_observations')
          .selectAll()
          .where(
            'case_id',
            'in',
            corrections.map((c) => c.id),
          )
          .orderBy('observed_at', 'desc')
          .limit(100)
          .execute()
      : [];
    return {
      corrections,
      observationHistory,
      competition: competition.data,
      pool,
      proposals,
      eligibilityReviews,
      preview,
      hold,
      rounds: rounds.map((r) => r.data),
      groups: groups.map((g) => g.data),
    };
  });
}
export async function readPublicPrizePool(
  db: DB,
  poolId: string,
  viewerAccountId: string | null,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('id', '=', poolId)
        .executeTakeFirst();
      if (!row || row.data.state !== 'published') throw new AccessDenied();
      const pool = row.data;
      if (pool.groupId) {
        const group = await tx
          .selectFrom('league_groups')
          .select('data')
          .where('id', '=', pool.groupId)
          .executeTakeFirstOrThrow();
        await requireGroupReader(tx, group.data, viewerAccountId);
      }
      const competition = await tx
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', pool.competitionId)
        .executeTakeFirstOrThrow();
      if (competition.data.status === 'draft') throw new AccessDenied();
      const rounds = await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', 'in', pool.gameweekIds)
        .orderBy('number')
        .execute();
      const current = await tx
        .selectFrom('prize_proposals')
        .select('data')
        .where('pool_id', '=', pool.id)
        .execute();
      const awarded = current
        .map((p) => p.data)
        .find((p) => p.state === 'approved' || p.state === 'fulfilled');
      const correction =
        awarded?.state === 'fulfilled'
          ? (
              await tx
                .selectFrom('prize_correction_cases')
                .select('data')
                .where('proposal_id', '=', awarded.id)
                .orderBy('id')
                .execute()
            )
              .map((r) => r.data)
              .sort(
                (a, b) =>
                  b.openedAt.localeCompare(a.openedAt) ||
                  b.id.localeCompare(a.id),
              )[0]
          : undefined;
      let held = false;
      if (awarded) {
        try {
          const preview = await calculatePrizePreview(tx, pool);
          held =
            preview.fingerprint !== awarded.preview.fingerprint ||
            preview.issues.length > 0;
          if (awarded.state === 'fulfilled')
            held =
              preview.issues.length > 0 ||
              correction?.state === 'open' ||
              prizeEvidenceFingerprint(preview) !==
                (correction?.observation.fingerprint ??
                  prizeEvidenceFingerprint(awarded.preview));
        } catch (error) {
          if (error instanceof CommandRejected) held = true;
          else throw error;
        }
      }
      const closedEntryNames = new Map(
        (awarded?.preview.awards.length
          ? await tx
              .selectFrom('entries')
              .innerJoin('accounts', 'accounts.id', 'entries.account_id')
              .select(['entries.id', 'entries.data'])
              .where(
                'entries.id',
                'in',
                awarded.preview.awards.map((a) => a.entryId),
              )
              .where('accounts.closed_at', 'is not', null)
              .execute()
          : []
        ).map((r) => [r.id, r.data.name]),
      );
      return {
        pool: { ...pool, evidenceReference: null },
        competition: competition.data,
        rounds: rounds.map((r) => r.data),
        awardState: awarded?.state ?? null,
        correctionState: correction?.state ?? null,
        held,
        awards: awarded
          ? awarded.preview.awards.map((a) => ({
              entryId: a.entryId,
              entryName: closedEntryNames.get(a.entryId) ?? a.entryName,
              rank: a.rank,
              reward: a.reward,
            }))
          : [],
      };
    });
}
/** The caller must authorize private-group access before requesting that group's summaries. */
export async function listPublishedPrizePools(
  db: DB,
  competitionId: string,
  groupId: string | null = null,
) {
  const rows = await db
    .selectFrom('prize_pools')
    .select('data')
    .where('competition_id', '=', competitionId)
    .where('group_id', groupId === null ? 'is' : '=', groupId)
    .execute();
  return rows
    .filter((r) => r.data.state === 'published')
    .map(({ data: p }) => ({ id: p.id, name: p.name }));
}
