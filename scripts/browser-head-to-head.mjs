import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
export async function exerciseHeadToHead(
  page,
  pool,
  base,
  entry,
  groupId,
  accountId,
) {
  // Add one local disposable fixture entry to this run's account, then exercise real group/H2H commands.
  const source = await pool.query(
    'SELECT data FROM fantasy.entries WHERE id=$1',
    [entry.id],
  );
  const extra = {
    ...source.rows[0].data,
    id: randomUUID(),
    name: 'QA Second XI',
  };
  await pool.query(
    'INSERT INTO fantasy.entries(id,competition_id,account_id,revision,data) VALUES($1,$2,$3,$4,$5)',
    [extra.id, entry.competition_id, accountId, extra.revision, extra],
  );
  await page.goto(`${base}/en/groups/${groupId}`);
  await page
    .getByLabel('Squad to join', { exact: true })
    .selectOption(extra.id);
  await page
    .getByRole('button', { name: 'REVIEW JOIN REQUEST', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByRole('cell', { name: 'QA Second XI', exact: true }),
  ).toBeVisible();
  await page.getByText('Create an H2H edition', { exact: true }).click();
  await page.getByLabel('Edition name').fill('QA Friends Cup');
  const roundChoices = page.locator('.h2h-round-choices input');
  await roundChoices.nth(0).check();
  await roundChoices.nth(1).check();
  await page
    .getByRole('button', { name: 'REVIEW H2H EDITION', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await page.waitForURL(/\/en\/head-to-head\/[a-f\d-]+$/u);
  const editionId = new URL(page.url()).pathname.split('/').at(-1);
  await page
    .getByRole('button', { name: 'OPEN REGISTRATION', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  const enter = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'ENTER YOUR SQUAD', exact: true }),
    })
    .last();
  for (const [i, id] of [entry.id, extra.id].entries()) {
    await enter.getByLabel('Squad', { exact: true }).selectOption(id);
    await enter
      .getByRole('button', { name: 'REVIEW REGISTRATION', exact: true })
      .click();
    await enter
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: `REGISTERED SQUADS (${i + 1})`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page
    .getByLabel(
      'I reviewed the roster and schedule below. Publishing freezes opponents.',
    )
    .check();
  await page
    .getByRole('button', { name: 'REVIEW SCHEDULE PUBLICATION', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByText('SCHEDULE PUBLISHED', { exact: true }),
  ).toBeVisible();
  const saved = await pool.query(
    'SELECT data FROM fantasy.h2h_editions WHERE id=$1',
    [editionId],
  );
  assert.equal(saved.rows[0]?.data.status, 'published');
  assert.equal(saved.rows[0].data.schedule.length, 2);
  await expect(
    page.getByRole('cell', { name: 'QA First XI', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'QA Second XI', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: 'QA Friends Cup', exact: true })
    .click();
  await page.screenshot({ path: 'artifacts/web/h2h-en.png', fullPage: true });
  await page.goto(`${base}/ar/head-to-head/${editionId}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.brand-logo:visible')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode().catch(() => {}))),
    );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/h2h-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'H2H draft, registration, frozen schedule publication, standings and Arabic mobile layout passed.',
  );
}
