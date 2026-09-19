import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
export async function exerciseEntryLifecycle(
  page,
  pool,
  base,
  competitionId,
  accountId,
) {
  const entry = (
    await pool.query(
      'SELECT id,data FROM fantasy.entries WHERE competition_id=$1 AND account_id=$2 ORDER BY id LIMIT 1',
      [competitionId, accountId],
    )
  ).rows[0];
  assert.ok(entry);
  await page.goto(`${base}/en/entries/${entry.id}`);
  const settings = page.getByRole('region', {
    name: 'Squad settings',
    exact: true,
  });
  await settings.getByText('Rename squad', { exact: true }).click();
  await settings
    .getByLabel('Squad name', { exact: true })
    .fill('QA RETIREMENT XI');
  await settings
    .getByRole('button', { name: 'Review name', exact: true })
    .click();
  await settings
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'QA RETIREMENT XI', exact: true }),
  ).toBeVisible();
  await settings.getByText('Retire squad', { exact: true }).click();
  await settings
    .getByLabel('I understand the consequences and want to continue.')
    .check();
  await settings
    .getByRole('button', { name: 'Review retirement', exact: true })
    .click();
  await expect(
    settings.getByText(
      'Retirement is permanent and does not free an entry slot.',
      { exact: false },
    ),
  ).toBeVisible();
  await settings
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'SQUAD RETIRED', exact: true }),
  ).toBeVisible();
  await expect(settings.getByText('Retire squad', { exact: true })).toHaveCount(
    0,
  );
  const stored = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entry.id])
  ).rows[0].data;
  assert.equal(stored.status, 'retired');
  assert.equal(
    (
      await pool.query(
        'SELECT entry_id FROM fantasy.entry_retirements WHERE entry_id=$1',
        [entry.id],
      )
    ).rows.length,
    1,
  );
  await page.screenshot({
    path: 'artifacts/web/entry-retired-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/entries/${entry.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'انتهت مشاركة الفريق', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/entry-retired-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/dashboard`);
  await expect(
    page.getByRole('link').filter({
      has: page.getByRole('heading', {
        name: 'QA RETIREMENT XI',
        exact: true,
      }),
    }),
  ).toContainText('Retired');
  console.log(
    'Squad rename, reviewed permanent retirement, preserved history and Arabic mobile retirement passed.',
  );
}
