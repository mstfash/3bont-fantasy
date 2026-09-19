import { exerciseHelpGuides } from './browser-help-guides.mjs';
import { exerciseInitialPrices } from './browser-initial-prices.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { Temporal } from '../apps/web/node_modules/@js-temporal/polyfill/dist/index.esm.js';

export async function exerciseCompetitionSetup(page, pool, base, slug) {
  await page.goto(`${base}/en/admin/competitions`);
  await page
    .getByLabel('Arabic name', { exact: true })
    .fill('بطولة اختبار المتصفح');
  await page
    .getByLabel('English name', { exact: true })
    .fill('Browser QA competition');
  await page
    .getByLabel('Arabic description')
    .fill('بطولة اصطناعية لاختبار دورة الإدارة');
  await page
    .getByLabel('English description')
    .fill('Synthetic competition for the administration journey');
  await page.getByLabel('Competition URL slug').fill(slug);
  await page.getByLabel('Registration closes').fill(
    Temporal.Instant.fromEpochMilliseconds(Date.now() + 30 * 86400_000)
      .toZonedDateTimeISO('Africa/Cairo')
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' }),
  );
  await page.getByText('Footballer scoring', { exact: true }).click();
  await page.getByLabel('Assist', { exact: true }).fill('4');
  await page
    .getByLabel('Reason — recorded in the audit trail')
    .fill('Browser test: reviewed draft');
  await page
    .getByRole('button', { name: 'REVIEW & SAVE', exact: true })
    .click();
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
  await page.waitForURL(/\/en\/admin\/competitions\/[\da-f-]+$/u);
  await expect(
    page.getByRole('heading', { name: 'Browser QA competition', exact: true }),
  ).toBeVisible();
  const rounds = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: 'Gameweeks & fixtures',
      exact: true,
    }),
  });
  await rounds.locator('input[type=checkbox]:enabled').first().check();
  await rounds.getByRole('button', { name: 'Suggest deadline:' }).click();
  await rounds
    .getByLabel('Reason for change or reassignment')
    .fill('Browser test: opening fixture and deadline');
  await rounds
    .getByRole('button', { name: 'REVIEW GAMEWEEK', exact: true })
    .click();
  await rounds
    .getByRole('button', { name: 'CONFIRM & SAVE', exact: true })
    .click();
  await expect(page.locator('.admin-title .eyebrow')).toContainText(
    'REVISION 2',
  );
  // Updates require a server-computed impact and expose the exact round schedule.
  await page.getByLabel('Maximum squads per account').fill('2');
  await page
    .getByLabel('Reason — recorded in the audit trail')
    .fill('Browser test: reviewed entry cap impact');
  const previewResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/admin/competitions/preview') &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'REVIEW & SAVE', exact: true })
    .click();
  const reviewed = await previewResponse;
  assert.equal(reviewed.status(), 200);
  const request = reviewed.request().postDataJSON();
  const bypass = await page.request.post(`${base}/api/v1/admin/competitions`, {
    headers: { Origin: base },
    data: request,
  });
  assert.equal(
    bypass.status(),
    400,
    'HTTP updates cannot bypass impact review',
  );
  const impact = page.getByRole('region', {
    name: 'Configuration impact',
    exact: true,
  });
  await expect(impact).toContainText('Entries per account: 1 → 2');
  await expect(impact).toContainText(
    '0 gameweeks receive an update; 1 keep their current rules.',
  );
  await impact.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/web/configuration-impact-en.png' });
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
  await expect(page.locator('.admin-title .eyebrow')).toContainText(
    'REVISION 3',
  );
  await exerciseInitialPrices(
    page,
    pool,
    base,
    new URL(page.url()).pathname.split('/').at(-1),
  );
  await page
    .getByRole('button', { name: 'Review publication', exact: true })
    .click();
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click();
  await expect(page.locator('.admin-title .eyebrow')).toContainText(
    'published',
  );
  const saved = await pool.query(
    'SELECT data FROM fantasy.competitions WHERE slug=$1',
    [slug],
  );
  assert.equal(saved.rows[0]?.data.status, 'published');
  assert.equal(saved.rows[0]?.data.rules.scoring.assist, 4000);
  await page.screenshot({
    path: 'artifacts/web/admin-setup-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/admin/competitions/${saved.rows[0].data.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/admin-setup-ar-mobile.png',
    fullPage: true,
  });
  await page.getByLabel('الحد الأقصى للفرق لكل حساب').fill('3');
  await page
    .getByLabel('سبب التغيير — يظهر في السجل')
    .fill('معاينة أثر تغيير الإعدادات لاختبار المتصفح');
  await page.getByRole('button', { name: 'مراجعة وحفظ', exact: true }).click();
  const arabicImpact = page.getByRole('region', {
    name: 'أثر تغيير الإعدادات',
    exact: true,
  });
  await expect(arabicImpact).toContainText('حد الفرق للحساب: ٢ ← ٣');
  await arabicImpact.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/configuration-impact-ar-mobile.png',
  });
  // Editing invalidates a displayed preview; late preview responses cannot revive it.
  await page.getByLabel('الحد الأقصى للفرق لكل حساب').fill('4');
  await expect(arabicImpact).toHaveCount(0);
  let releasePreview;
  const held = new Promise((resolve) => {
    releasePreview = resolve;
  });
  const previewPath = '**/api/v1/admin/competitions/preview';
  await page.route(previewPath, async (route) => {
    await held;
    await route.continue();
  });
  const pending = page.waitForRequest((r) =>
    r.url().endsWith('/api/v1/admin/competitions/preview'),
  );
  await page.getByRole('button', { name: 'مراجعة وحفظ', exact: true }).click();
  await pending;
  await page.getByLabel('الحد الأقصى للفرق لكل حساب').fill('5');
  const finished = page.waitForResponse((r) =>
    r.url().endsWith('/api/v1/admin/competitions/preview'),
  );
  releasePreview();
  assert.equal((await finished).status(), 200);
  await expect(
    page.getByRole('button', { name: 'مراجعة وحفظ', exact: true }),
  ).toBeEnabled();
  await expect(arabicImpact).toHaveCount(0);
  await page.unroute(previewPath);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/competitions/${slug}`);
  await expect(
    page.getByRole('heading', { name: 'Browser QA competition', exact: true }),
  ).toBeVisible();
  await exerciseHelpGuides(page, pool, base, slug);
  await page.goto(`${base}/en/admin`);
  console.log(
    'Browser draft creation, fixture/deadline setup, price approval, publication, configuration impact review and Arabic mobile layout passed.',
  );
}
