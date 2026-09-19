import { waitForVisibleImages } from './browser-images.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function createBrowserAchievement(page, pool, base, slug) {
  const competition = (
    await pool.query('SELECT id FROM fantasy.competitions WHERE slug=$1', [
      slug,
    ])
  ).rows[0];
  await page.goto(
    `${base}/en/admin/competitions/${competition.id}/achievements`,
  );
  const editor = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'New achievement', exact: true }),
  });
  await editor.getByLabel('Arabic achievement name').fill('فريقي جاهز');
  await editor
    .getByLabel('English achievement name')
    .fill('QA Ready for Kickoff');
  await editor
    .getByLabel('Arabic achievement description')
    .fill('فعّلت أول فريق مؤهل في البطولة');
  await editor
    .getByLabel('English achievement description')
    .fill('Activated an eligible squad in the competition');
  await editor
    .getByLabel('Achievement condition', { exact: true })
    .selectOption('activated');
  await editor
    .getByLabel('Definition reason')
    .fill('QA reviewed activation badge');
  await editor
    .getByRole('button', { name: 'Review achievement definition', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  const card = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: 'QA Ready for Kickoff',
      exact: true,
    }),
  });
  await expect(card).toBeVisible();
  const publication = card.locator('form').filter({
    has: page.getByRole('button', {
      name: 'Publish achievement',
      exact: true,
    }),
  });
  await publication
    .getByLabel('Action reason')
    .fill('QA publish cosmetic badge before round opening');
  await publication
    .getByRole('button', { name: 'Publish achievement', exact: true })
    .click();
  await publication
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(card.getByText('PUBLISHED', { exact: false })).toBeVisible();
  const definitions = await pool.query(
    'SELECT data FROM fantasy.achievement_definitions WHERE competition_id=$1',
    [competition.id],
  );
  assert.equal(definitions.rowCount, 1);
  assert.equal(definitions.rows[0].data.state, 'published');
  await page.goto(`${base}/en/competitions/${slug}/achievements`);
  await expect(
    page.getByRole('heading', { name: 'QA Ready for Kickoff', exact: true }),
  ).toBeVisible();
  return competition.id;
}
export async function verifyBrowserAchievement(
  page,
  pool,
  base,
  competitionId,
) {
  await page.goto(
    `${base}/en/admin/competitions/${competitionId}/achievements`,
  );
  const form = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: 'Grant reconciliation',
      exact: true,
    }),
  });
  await form
    .getByLabel('Action reason')
    .fill('QA reconcile activated squad without changing gameplay');
  await form
    .getByRole('button', { name: 'Reconcile earned achievements', exact: true })
    .click();
  await form
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(form.getByRole('status')).toContainText('Saved.');
  const awards = await pool.query(
    'SELECT data FROM fantasy.achievement_grants WHERE competition_id=$1',
    [competitionId],
  );
  assert.equal(awards.rowCount, 1);
  assert.equal(awards.rows[0].data.state, 'active');
  await page.goto(`${base}/en/dashboard`);
  await expect(
    page.getByRole('heading', { name: 'QA Ready for Kickoff', exact: true }),
  ).toBeVisible();
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/achievements-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/dashboard`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'فريقي جاهز', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/achievements-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin`);
}
