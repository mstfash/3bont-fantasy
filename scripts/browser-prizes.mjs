import { waitForVisibleImages } from './browser-images.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function createBrowserPrize(page, pool, base, slug) {
  const competition = (
    await pool.query('SELECT id FROM fantasy.competitions WHERE slug=$1', [
      slug,
    ])
  ).rows[0];
  await page.goto(`${base}/en/admin/prizes?competition=${competition.id}`);
  await page.getByLabel('Arabic prize name').fill('جائزة تجريبية فقط');
  await page.getByLabel('English prize name').fill('QA Rehearsal Award');
  await page
    .getByLabel('Arabic prize terms')
    .fill(
      'تجربة اصطناعية. لا توجد أموال أو جوائز حقيقية. تُقسّم المبالغ المتعادلة بالتساوي.',
    );
  await page
    .getByLabel('English prize terms')
    .fill(
      'Synthetic rehearsal. No money or real prizes. Tied prizes split equally.',
    );
  await page.getByLabel('Amount 1', { exact: true }).fill('150.01');
  await page
    .getByLabel('Reason for saving')
    .fill('QA documented synthetic prize terms');
  await page
    .getByRole('button', { name: 'Review prize terms', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await page.waitForURL(/\/en\/admin\/prizes\/[\da-f-]+$/u);
  const id = page.url().split('/').at(-1);
  assert.ok(id);
  const publication = page.locator('form').filter({
    has: page.getByRole('button', {
      name: 'Publish binding terms',
      exact: true,
    }),
  });
  await publication
    .getByLabel('Terms and eligibility review reference')
    .fill('QA synthetic-only review — no real award offered');
  await publication
    .getByLabel('Reason and evidence')
    .fill('Reviewed cutoff, currency and published tie terms');
  await publication
    .getByLabel('I reviewed the terms, recipients and displayed results.')
    .check();
  await publication
    .getByRole('button', { name: 'Publish binding terms', exact: true })
    .click();
  await publication
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'View participant terms' }),
  ).toBeVisible();
  const stored = (
    await pool.query('SELECT data FROM fantasy.prize_pools WHERE id=$1', [id])
  ).rows[0].data;
  assert.equal(stored.state, 'published');
  assert.equal(stored.places[0].amountMinor, 15001);
  await page.goto(`${base}/en/prizes/${id}`);
  await expect(page.getByText('150.01 EGP', { exact: true })).toBeVisible();
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/prize-terms-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/prizes/${id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'جائزة تجريبية فقط', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/prize-terms-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin`);
  return id;
}
export async function verifyPrizeSelfAwardHold(page, pool, base, id) {
  const verification = await pool.query(
    `SELECT u."emailVerified" AS verified FROM fantasy.entries e JOIN fantasy.prize_pools p ON p.competition_id=e.competition_id LEFT JOIN "user" u ON u.id=e.account_id WHERE p.id=$1`,
    [id],
  );
  assert.ok(verification.rows.every((row) => row.verified === true));
  await page.goto(`${base}/en/admin/prizes/${id}`);
  await expect(
    page.getByRole('cell', { name: 'QA Scoring XI', exact: true }).first(),
  ).toBeVisible();
  const form = page.locator('form').filter({
    has: page.getByRole('button', {
      name: 'Prepare award proposal',
      exact: true,
    }),
  });
  await form
    .getByLabel('Reason and evidence')
    .fill('QA verifies self-award prevention');
  await form
    .getByLabel('I reviewed the terms, recipients and displayed results.')
    .check();
  await form
    .getByRole('button', { name: 'Prepare award proposal', exact: true })
    .click();
  await form
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(form.getByRole('status')).toContainText('own award');
  await page
    .getByRole('heading', { name: 'QA Rehearsal Award', exact: true })
    .first()
    .click();
  await page.screenshot({
    path: 'artifacts/web/admin-prize-review-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/en/admin`);
}
