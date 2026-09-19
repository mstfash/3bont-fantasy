import { waitForVisibleImages } from './browser-images.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
const wall = (offset) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(Date.now() + offset))
    .replace(' ', 'T');
export async function exerciseSponsors(page, pool, base, competitionId, slug) {
  await page.goto(`${base}/en/admin/sponsors?competition=${competitionId}`);
  const upload = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Sponsor artwork', exact: true }),
  });
  await upload
    .getByLabel('Artwork label', { exact: true })
    .fill('QA authorized 3BONT artwork');
  await upload
    .getByLabel('Artwork file', { exact: true })
    .setInputFiles('apps/web/public/brand/3bont-fantasy-en-light.png');
  await upload
    .getByLabel('Artwork authorization reference', { exact: true })
    .fill('QA supplied project brand, synthetic preview only');
  await upload
    .getByRole('button', { name: 'Save approved artwork', exact: true })
    .click();
  await expect(upload.getByRole('status')).toContainText(
    'Approved artwork saved.',
  );
  const asset = (
    await pool.query(
      'SELECT id FROM fantasy.sponsor_assets WHERE competition_id=$1',
      [competitionId],
    )
  ).rows[0];
  assert.ok(asset);
  const anonymous = await page.context().browser().newContext();
  try {
    assert.equal(
      (
        await anonymous.request.get(
          `${base}/api/v1/sponsors/assets/${asset.id}`,
        )
      ).status(),
      404,
    );
  } finally {
    await anonymous.close();
  }
  const editor = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'New campaign', exact: true }),
  });
  await editor.getByLabel('Arabic sponsor name').fill('شريك تجريبي');
  await editor.getByLabel('English sponsor name').fill('QA PARTNER');
  await editor
    .getByLabel('Arabic sponsor description')
    .fill('معاينة رعاية مصطنعة للاختبار فقط');
  await editor
    .getByLabel('English sponsor description')
    .fill('Synthetic sponsor preview for browser verification');
  await editor
    .getByLabel('Arabic artwork', { exact: true })
    .selectOption(asset.id);
  await editor
    .getByLabel('English artwork', { exact: true })
    .selectOption(asset.id);
  await editor
    .getByLabel('Sponsor HTTPS destination')
    .fill('https://example.com/3bont-preview');
  await editor
    .getByLabel('Campaign starts — Cairo time')
    .fill(wall(-5 * 60000));
  await editor.getByLabel('Campaign ends — Cairo time').fill(wall(86400_000));
  await editor
    .getByLabel('Draft reason')
    .fill('QA review bilingual synthetic placement');
  await editor
    .getByRole('button', { name: 'Review sponsor draft', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  const card = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'QA PARTNER', exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByText('Preview both languages', { exact: true }).click();
  await expect(card.getByAltText('QA PARTNER', { exact: true })).toBeVisible();
  await card
    .getByLabel('Artwork, destination and copy approval reference')
    .fill('QA reviewed logo, text and destination rights');
  await card
    .getByLabel('Action reason')
    .fill('QA publish scheduled sponsor placement');
  await card
    .getByRole('button', { name: 'Publish campaign', exact: true })
    .click();
  await card
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(card.getByText('PUBLISHED', { exact: false })).toBeVisible();
  await page.goto(`${base}/en/competitions/${slug}`);
  const banner = page.getByRole('complementary', {
    name: 'Sponsorship',
    exact: true,
  });
  await expect(banner).toBeVisible();
  await expect(banner.getByText('QA PARTNER', { exact: true })).toBeVisible();
  await expect(
    banner.getByRole('link', { name: 'Visit sponsor ↗', exact: true }),
  ).toHaveAttribute('href', 'https://example.com/3bont-preview');
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/sponsor-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/competitions/${slug}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('complementary', { name: 'رعاية', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/sponsor-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/sponsors?competition=${competitionId}`);
  const pause = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'QA PARTNER', exact: true }),
  });
  await pause
    .getByLabel('Action reason')
    .fill('QA end temporary sponsor verification');
  await pause
    .getByRole('button', { name: 'Pause campaign', exact: true })
    .click();
  await pause
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(pause.getByText('PAUSED', { exact: false })).toBeVisible();
  await page.goto(`${base}/en/competitions/${slug}`);
  await expect(
    page.getByRole('complementary', { name: 'Sponsorship', exact: true }),
  ).toHaveCount(0);
  await page.goto(`${base}/en/admin`);
  console.log(
    'Sponsor upload, protected preview, bilingual publication, visible disclosure, mobile layout and pausing passed.',
  );
}
