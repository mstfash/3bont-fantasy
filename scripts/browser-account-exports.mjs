import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expect, request } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { buildNextAccountExport } from '../packages/application/dist/index.js';
export async function exerciseAccountExports(page, pool, base) {
  await page.goto(`${base}/en/profile`);
  const card = page.locator('.group-card').filter({
    has: page.getByRole('heading', {
      name: 'YOUR GAME-DATA ARCHIVE',
      exact: true,
    }),
  });
  await card
    .getByRole('button', { name: 'Request private archive', exact: true })
    .click();
  await expect(card.getByRole('status')).toContainText(
    'Your request is saved.',
  );
  await expect(
    card.getByText('Queued for preparation', { exact: true }),
  ).toBeVisible();
  const built = await buildNextAccountExport(createDatabase(pool));
  assert.equal(built?.state, 'ready');
  await page.reload();
  const href = await card
    .getByRole('link', { name: 'Download my data', exact: true })
    .getAttribute('href');
  assert.ok(href);
  const response = await page.request.get(`${base}${href}`);
  assert.equal(response.status(), 200);
  const body = await response.body();
  assert.equal(Number(response.headers()['content-length']), body.length);
  assert.equal(
    response.headers()['x-archive-sha256'],
    createHash('sha256').update(body).digest('hex'),
  );
  const records = body
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const session = await (
    await page.request.get(`${base}/api/auth/get-session`)
  ).json();
  assert.equal(
    records.find((r) => r.type === 'profile').data.id,
    session.user.id,
  );
  assert.equal(records.at(-1).type, 'completion');
  const anonymous = await request.newContext();
  try {
    assert.equal((await anonymous.get(`${base}${href}`)).status(), 401);
  } finally {
    await anonymous.dispose();
  }
  await page.screenshot({
    path: 'artifacts/web/account-exports-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/profile`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('link', { name: 'تنزيل بياناتي', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/account-exports-ar-mobile.png',
    fullPage: true,
  });
  const expired = new Date(Date.now() - 1000).toISOString();
  await pool.query(
    "UPDATE fantasy.account_exports SET expires_at=$2::text::timestamptz,data=jsonb_set(data,'{expiresAt}',to_jsonb($2::text)) WHERE id=$1",
    [built.id, expired],
  );
  assert.equal((await page.request.get(`${base}${href}`)).status(), 404);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/dashboard`);
  console.log(
    'Private archive request, committed download, owner-only access, checksum, expiry and Arabic mobile passed.',
  );
}
