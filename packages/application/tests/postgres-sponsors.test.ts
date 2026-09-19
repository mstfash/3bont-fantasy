import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  sponsorCommandSchema,
  sponsorDestinationSchema,
} from '@fantasy/contracts';
import {
  normalizeSponsorImage,
  storeSponsorAsset,
} from '../src/sponsor-assets.ts';
import { executeSponsorCommand } from '../src/sponsor-commands.ts';
import {
  activeSponsor,
  readSponsorAsset,
  readSponsorAdministration,
} from '../src/sponsor-query.ts';
import {
  issueSponsorMetricToken,
  recordSponsorMetric,
  purgeSponsorReceipts,
} from '../src/sponsor-metrics.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('sponsors validate raster assets, scoped approval, deterministic placement and anonymous duplicate-resistant reporting', async () => {
  const principal = {
      accountId: 'sponsor-proof',
      sessionId: 'sponsor-session',
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'sponsor-manager' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const bytes = await sharp({
    create: { width: 600, height: 200, channels: 3, background: '#112233' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    normalizeSponsorImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    ),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'sponsor-image-format',
  );
  await assert.rejects(
    normalizeSponsorImage(
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#112233' },
      })
        .png()
        .toBuffer(),
    ),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'sponsor-image-dimensions',
  );
  const upload = {
    commandId: randomUUID(),
    competitionId: null,
    label: 'Approved fixture artwork',
    authorizationReference: 'QA artwork licensed for synthetic test',
  };
  const asset = await storeSponsorAsset(db, principal, grants, upload, bytes);
  assert.deepEqual(
    await storeSponsorAsset(db, principal, grants, upload, bytes),
    asset,
  );
  assert.equal(await readSponsorAsset(db, asset.id, null), null);
  const privateAsset = await readSponsorAsset(db, asset.id, {
    principal,
    grants,
  });
  assert.ok(privateAsset);
  assert.equal((await sharp(privateAsset.content).metadata()).format, 'webp');
  await assert.rejects(
    storeSponsorAsset(
      db,
      principal,
      [{ role: 'sponsor-manager', competitionId: randomUUID() }],
      { ...upload, commandId: randomUUID() },
      bytes,
    ),
    AccessDenied,
  );
  assert.equal(
    sponsorDestinationSchema.safeParse('javascript:alert(1)').success,
    false,
  );
  assert.equal(
    sponsorDestinationSchema.safeParse('https://user:password@example.com')
      .success,
    false,
  );
  const definition = {
    competitionId: null,
    name: { ar: 'راعي تجريبي', en: 'Synthetic partner' },
    description: { ar: 'رعاية للاختبار فقط', en: 'Synthetic sponsor artwork' },
    assets: { ar: asset.id, en: asset.id },
    destination: 'https://example.com/sponsor',
    slot: 'header',
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 86400_000).toISOString(),
    priority: 10,
    reason: 'Reviewed campaign fixture',
  };
  const draft = await executeSponsorCommand(
    db,
    principal,
    grants,
    sponsorCommandSchema.parse({
      ...definition,
      kind: 'create',
      commandId: randomUUID(),
    }),
  );
  assert.equal(await activeSponsor(db, 'header', null), null);
  const publish = {
    kind: 'publish' as const,
    commandId: randomUUID(),
    competitionId: null,
    campaignId: draft.campaignId,
    expectedRevision: draft.revision,
    authorizationReference:
      'QA publisher artwork and destination authorization',
    reason: 'Publish synthetic partner',
  };
  const published = await executeSponsorCommand(db, principal, grants, publish);
  assert.deepEqual(
    await executeSponsorCommand(db, principal, grants, publish),
    published,
  );
  const campaign = await activeSponsor(db, 'header', null);
  assert.ok(campaign);
  assert.equal(campaign.id, draft.campaignId);
  assert.equal((await readSponsorAsset(db, asset.id, null))?.public, true);
  await assert.rejects(
    executeSponsorCommand(
      db,
      principal,
      grants,
      sponsorCommandSchema.parse({
        ...definition,
        kind: 'update',
        campaignId: campaign.id,
        expectedRevision: campaign.revision,
        commandId: randomUUID(),
      }),
    ),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'sponsor-pause-before-edit',
  );
  const secret = randomUUID() + randomUUID(),
    now = Date.now(),
    token = issueSponsorMetricToken(campaign, 'ar', secret, now - 2000),
    ua = 'Mozilla/5.0 Chrome/150 Safari/537.36';
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      recordSponsorMetric(db, token, 'impression', secret, ua, new Date(now)),
    ),
  );
  assert.equal(attempts.filter(Boolean).length, 1);
  assert.equal(
    await recordSponsorMetric(db, token, 'click', secret, ua, new Date(now)),
    true,
  );
  assert.equal(
    await recordSponsorMetric(db, token, 'click', secret, ua, new Date(now)),
    false,
  );
  assert.equal(
    await recordSponsorMetric(
      db,
      token + 'x',
      'impression',
      secret,
      ua,
      new Date(now),
    ),
    false,
  );
  assert.equal(
    await recordSponsorMetric(
      db,
      issueSponsorMetricToken(campaign, 'en', secret, now - 2000),
      'impression',
      secret,
      'Googlebot crawler',
      new Date(now),
    ),
    false,
  );
  assert.equal(
    await recordSponsorMetric(
      db,
      issueSponsorMetricToken(campaign, 'en', secret, now),
      'impression',
      secret,
      ua,
      new Date(now),
    ),
    false,
  );
  assert.equal(
    await recordSponsorMetric(
      db,
      issueSponsorMetricToken(campaign, 'en', secret, now - 700000),
      'impression',
      secret,
      ua,
      new Date(now),
    ),
    false,
  );
  const report = await readSponsorAdministration(db, principal, grants, null);
  assert.equal(report.metrics.length, 1);
  assert.ok(
    report.metrics.every(
      (m) => m.impressions === '1' && m.clicks === '1' && m.locale === 'ar',
    ),
  );
  const pause = await executeSponsorCommand(db, principal, grants, {
    kind: 'pause',
    commandId: randomUUID(),
    campaignId: campaign.id,
    competitionId: null,
    expectedRevision: campaign.revision,
    reason: 'End temporary synthetic placement',
  });
  assert.equal(await activeSponsor(db, 'header', null), null);
  assert.equal(
    await recordSponsorMetric(
      db,
      issueSponsorMetricToken(campaign, 'en', secret, now - 2000),
      'click',
      secret,
      ua,
    ),
    false,
  );
  await executeSponsorCommand(
    db,
    principal,
    grants,
    sponsorCommandSchema.parse({
      ...definition,
      kind: 'update',
      campaignId: campaign.id,
      expectedRevision: pause.revision,
      commandId: randomUUID(),
      priority: 20,
    }),
  );
  const second = await executeSponsorCommand(
    db,
    principal,
    grants,
    sponsorCommandSchema.parse({
      ...definition,
      kind: 'create',
      commandId: randomUUID(),
      priority: 5,
    }),
  );
  await executeSponsorCommand(db, principal, grants, {
    ...publish,
    commandId: randomUUID(),
    expectedRevision: second.revision,
    campaignId: second.campaignId,
  });
  await executeSponsorCommand(db, principal, grants, {
    ...publish,
    commandId: randomUUID(),
    expectedRevision: pause.revision + 1,
  });
  assert.equal((await activeSponsor(db, 'header', null))?.id, campaign.id);
  await db
    .updateTable('sponsor_metric_receipts')
    .set({ expires_at: new Date(Date.now() - 1) })
    .execute();
  await purgeSponsorReceipts(db);
  assert.equal(
    (
      await db
        .selectFrom('sponsor_metric_receipts')
        .select('fingerprint')
        .execute()
    ).length,
    0,
  );
});
