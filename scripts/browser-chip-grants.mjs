import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
export async function exerciseChipGrants(page, pool, base, slug) {
  const competition = (
    await pool.query('SELECT data FROM fantasy.competitions WHERE slug=$1', [
      slug,
    ])
  ).rows[0].data;
  const previous = (
    await pool.query(
      'SELECT data FROM fantasy.gameweeks WHERE competition_id=$1 ORDER BY number DESC LIMIT 1',
      [competition.id],
    )
  ).rows[0].data;
  const round = {
    ...previous,
    id: randomUUID(),
    number: previous.number + 1,
    name: { ar: 'جولة المنحة التجريبية', en: 'QA Grant Round' },
    deadline: new Date(
      Date.parse(previous.deadline) + 7 * 86400000,
    ).toISOString(),
    status: 'upcoming',
    resultRevision: 0,
    finalizedAt: null,
    lastMaterialChangeAt: null,
    issues: [],
  };
  await pool.query(
    'INSERT INTO fantasy.gameweeks(id,competition_id,number,deadline,data) VALUES($1,$2,$3,$4,$5)',
    [round.id, competition.id, round.number, round.deadline, round],
  );
  await page.goto(`${base}/en/admin/competitions/${competition.id}`);
  const editor = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Equal chip grant', exact: true }),
  });
  await editor
    .getByLabel('Grant gameweek', { exact: true })
    .selectOption(round.id);
  await editor.getByLabel('Bench Boost', { exact: true }).fill('1');
  await editor
    .getByLabel('Arabic announcement', { exact: true })
    .fill('منحة متساوية لكل فريق مؤهل');
  await editor
    .getByLabel('English announcement', { exact: true })
    .fill('An equal grant for every eligible squad');
  await editor
    .getByLabel('Grant audit reason')
    .fill('QA future grant with public notice');
  await editor
    .getByLabel(
      'I reviewed the equal allocation, timing and binding announcement.',
    )
    .check();
  await editor
    .getByRole('button', { name: 'REVIEW EQUAL GRANT', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    editor.getByRole('cell', {
      name: 'An equal grant for every eligible squad',
      exact: true,
    }),
  ).toBeVisible();
  const grants = await pool.query(
    'SELECT data FROM fantasy.chip_grants WHERE competition_id=$1',
    [competition.id],
  );
  assert.equal(grants.rowCount, 1);
  assert.equal(grants.rows[0].data.amounts['bench-boost'], 1);
  await page.goto(`${base}/en/competitions/${slug}/rules?gameweek=${round.id}`);
  await expect(
    page.getByText('An equal grant for every eligible squad', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/web/rules-grants-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/competitions/${slug}/rules?gameweek=${round.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText('منحة متساوية لكل فريق مؤهل', { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/rules-grants-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin`);
}
