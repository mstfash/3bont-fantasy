import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { idSchema, type SponsorCampaign } from '@fantasy/contracts';
const tokenSchema = z.strictObject({
  campaignId: idSchema,
  revision: z.int().positive(),
  locale: z.enum(['ar', 'en']),
  nonce: idSchema,
  issuedAt: z.int(),
  expiresAt: z.int(),
});
const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`sponsor-metric:v1:${payload}`).digest();
export function issueSponsorMetricToken(
  campaign: SponsorCampaign,
  locale: 'ar' | 'en',
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      campaignId: campaign.id,
      revision: campaign.revision,
      locale,
      nonce: randomUUID(),
      issuedAt: now,
      expiresAt: now + 10 * 60000,
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}
export function sponsorReportingDay(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export async function recordSponsorMetric(
  db: ReturnType<typeof createDatabase>,
  token: string,
  kind: 'impression' | 'click',
  secret: string,
  userAgent: string,
  now = new Date(),
) {
  if (
    token.length > 2000 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token) ||
    /bot|crawler|spider|headless|preview|scrapy/iu.test(userAgent) ||
    userAgent.length < 10
  )
    return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload, secret),
    provided = Buffer.from(signature, 'base64url');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return false;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) return false;
  const data = parsed.data;
  if (
    data.expiresAt <= now.getTime() ||
    data.issuedAt > now.getTime() ||
    data.expiresAt - data.issuedAt !== 10 * 60000 ||
    (kind === 'impression' && data.issuedAt + 1000 > now.getTime())
  )
    return false;
  return db.transaction().execute(async (tx) => {
    const row = await tx
      .selectFrom('sponsor_campaigns')
      .select('data')
      .where('id', '=', data.campaignId)
      .forShare()
      .executeTakeFirst();
    if (
      !row ||
      row.data.state !== 'published' ||
      row.data.revision !== data.revision ||
      Date.parse(row.data.startsAt) > now.getTime() ||
      Date.parse(row.data.endsAt) <= now.getTime()
    )
      return false;
    const receipt = await tx
      .insertInto('sponsor_metric_receipts')
      .values({
        fingerprint: createHash('sha256').update(token).digest('hex'),
        kind,
        expires_at: new Date(data.expiresAt),
      })
      .onConflict((oc) => oc.columns(['fingerprint', 'kind']).doNothing())
      .returning('fingerprint')
      .executeTakeFirst();
    if (!receipt) return false;
    const day = sponsorReportingDay(now);
    await tx
      .insertInto('sponsor_daily_metrics')
      .values({
        campaign_id: data.campaignId,
        revision: data.revision,
        day,
        locale: data.locale,
        kind,
        count: 1,
      })
      .onConflict((oc) =>
        oc
          .columns(['campaign_id', 'revision', 'day', 'locale', 'kind'])
          .doUpdateSet({
            count: sql<number>`least(fantasy.sponsor_daily_metrics.count+1,1000000000)`,
          }),
      )
      .execute();
    return true;
  });
}
export async function purgeSponsorReceipts(
  db: ReturnType<typeof createDatabase>,
) {
  await db
    .deleteFrom('sponsor_metric_receipts')
    .where('expires_at', '<=', new Date())
    .execute();
}
