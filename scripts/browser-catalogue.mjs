import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export async function exerciseCatalogue(page, pool, base, cleanupSeasons) {
  const label = `Browser catalogue ${randomUUID().slice(0, 8)}`;
  await page.goto(`${base}/en/admin/catalogue/season/new`);
  await page
    .getByLabel('Arabic name', { exact: true })
    .fill('موسم اختبار الدليل');
  await page.getByLabel('English name', { exact: true }).fill(label);
  await page.getByLabel('Demonstration season with fictional data').check();
  await page
    .getByLabel('Reason and evidence for this change')
    .fill('Browser proof: fictional season');
  await page
    .getByRole('button', { name: 'Review change', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm save', exact: true }).click();
  await page.waitForURL(/\/en\/admin\/catalogue\?season=/u);
  const seasonId = new URL(page.url()).searchParams.get('season');
  assert.ok(seasonId);
  cleanupSeasons.push(seasonId);
  await page.getByRole('link', { name: 'Add club ↗' }).click();
  await page
    .getByLabel('Arabic name', { exact: true })
    .fill('نادي اختبار الدليل');
  await page.getByLabel('English name', { exact: true }).fill('Catalogue club');
  await page.getByLabel('Club abbreviation').fill('CAT');
  await page
    .getByLabel('Reason and evidence for this change')
    .fill('Browser proof: club source reviewed');
  await page
    .getByRole('button', { name: 'Review change', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm save', exact: true }).click();
  await page.waitForURL(/\/en\/admin\/catalogue\?season=/u);
  await page.getByRole('link', { name: 'Add footballer ↗' }).click();
  await page
    .getByLabel('Arabic name', { exact: true })
    .fill('لاعب اختبار الدليل');
  await page
    .getByLabel('English name', { exact: true })
    .fill('Catalogue player');
  await page.getByLabel('I have a sourced valuation').check();
  await page.getByLabel('Amount in currency').fill('1.234');
  await page.getByLabel('Currency code').fill('KWD');
  await page.getByLabel('Valuation as of').fill('2026-01-02T12:00');
  await page
    .getByLabel('Source name', { exact: true })
    .fill('Fictional browser evidence');
  await page
    .getByLabel('Source HTTPS URL')
    .fill('https://example.com/browser-proof');
  await page
    .getByLabel('Rights to display this value publicly have been verified')
    .check();
  await page
    .getByLabel('Reason and evidence for this change')
    .fill('Browser proof: approved fictional valuation');
  await page
    .getByRole('button', { name: 'Review change', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm save', exact: true }).click();
  await page.waitForURL(/\/en\/admin\/catalogue\?season=/u);
  const { rows } = await pool.query(
    'SELECT data FROM fantasy.footballers WHERE season_id=$1',
    [seasonId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.valuation.amountMinor, 1234);
  assert.equal(rows[0].data.valuation.currency, 'KWD');
  assert.equal(rows[0].data.valuation.licensedForDisplay, true);
  await page
    .getByRole('link', { name: 'Catalogue player ↗', exact: true })
    .click();
  await expect(page.getByLabel('Amount in currency')).toHaveValue('1.234');
  await page.screenshot({
    path: 'artifacts/web/admin-catalogue-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/admin/catalogue/footballer/${rows[0].data.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator('.brand-logo:visible')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode().catch(() => {}))),
    );
  await page.screenshot({
    path: 'artifacts/web/admin-catalogue-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
