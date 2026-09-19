import { sponsorReportingDay } from './sponsor-metrics.ts';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import type { SponsorSlot } from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
export async function activeSponsor(
  db: ReturnType<typeof createDatabase>,
  slot: SponsorSlot,
  competitionId: string | null,
  now = new Date(),
) {
  const row = await db
    .selectFrom('sponsor_campaigns')
    .select('data')
    .where('competition_id', competitionId === null ? 'is' : '=', competitionId)
    .where(sql<string>`data->>'state'`, '=', 'published')
    .where(sql<string>`data->>'slot'`, '=', slot)
    .where(sql<Date>`(data->>'startsAt')::timestamptz`, '<=', now)
    .where(sql<Date>`(data->>'endsAt')::timestamptz`, '>', now)
    .orderBy(sql<number>`(data->>'priority')::integer`, 'desc')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();
  return row?.data ?? null;
}
export async function readSponsorAdministration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string | null,
) {
  requireCapability(
    principal,
    grants,
    'sponsors.manage',
    competitionId,
    new Date(),
  );
  const [campaigns, assets] = await Promise.all([
    db
      .selectFrom('sponsor_campaigns')
      .select('data')
      .where(
        'competition_id',
        competitionId === null ? 'is' : '=',
        competitionId,
      )
      .orderBy('id')
      .execute(),
    db
      .selectFrom('sponsor_assets')
      .select(['id', 'label', 'width', 'height', 'created_at'])
      .where(
        'competition_id',
        competitionId === null ? 'is' : '=',
        competitionId,
      )
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute(),
  ]);
  const today = sponsorReportingDay(new Date()),
    reportSince = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400_000)
      .toISOString()
      .slice(0, 10);
  const ids = campaigns.map((c) => c.data.id),
    metrics = ids.length
      ? await db
          .selectFrom('sponsor_daily_metrics')
          .select([
            'campaign_id',
            'revision',
            'locale',
            sql<string>`coalesce(sum(count) FILTER (WHERE kind='impression'),0)`.as(
              'impressions',
            ),
            sql<string>`coalesce(sum(count) FILTER (WHERE kind='click'),0)`.as(
              'clicks',
            ),
          ])
          .where('campaign_id', 'in', ids)
          .where('day', '>=', reportSince)
          .where('day', '<=', today)
          .groupBy(['campaign_id', 'revision', 'locale'])
          .orderBy('revision', 'desc')
          .execute()
      : [];
  return {
    campaigns: campaigns.map((c) => c.data),
    assets: assets.map((a) => ({
      ...a,
      created_at: a.created_at.toISOString(),
    })),
    metrics,
    reportSince,
    today,
  };
}
export async function readSponsorAsset(
  db: ReturnType<typeof createDatabase>,
  id: string,
  staff: { principal: Principal; grants: readonly StaffGrant[] } | null,
) {
  const asset = await db
    .selectFrom('sponsor_assets')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!asset) return null;
  const now = new Date();
  const published = await db
    .selectFrom('sponsor_campaigns')
    .select('id')
    .where(sql<string>`data->>'state'`, '=', 'published')
    .where(sql<Date>`(data->>'startsAt')::timestamptz`, '<=', now)
    .where(sql<Date>`(data->>'endsAt')::timestamptz`, '>', now)
    .where((eb) =>
      eb.or([
        eb(sql<string>`data->'assets'->>'ar'`, '=', id),
        eb(sql<string>`data->'assets'->>'en'`, '=', id),
      ]),
    )
    .executeTakeFirst();
  if (!published) {
    if (!staff) return null;
    requireCapability(
      staff.principal,
      staff.grants,
      'sponsors.manage',
      asset.competition_id,
      now,
    );
  }
  return {
    content: asset.content,
    checksum: asset.checksum,
    public: !!published,
  };
}
