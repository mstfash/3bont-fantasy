import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseProfile(page, pool, base) {
  await page.goto(`${base}/en/profile`);
  await expect(
    page.getByRole('heading', { name: 'YOUR PROFILE', exact: true }),
  ).toBeVisible();
  const name = `Browser fantasy manager ${Date.now()}`;
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page
    .getByRole('button', { name: 'Save display name', exact: true })
    .click();
  await expect(
    page
      .locator('.group-card')
      .filter({
        has: page.getByRole('heading', {
          name: 'YOUR NAME IN THE GAME',
          exact: true,
        }),
      })
      .getByRole('status'),
  ).toHaveText('Display name saved.');
  const session = await (
    await page.request.get(`${base}/api/auth/get-session`)
  ).json();
  assert.equal(session.user.name, name);
  const account = (
    await pool.query('SELECT display_name FROM fantasy.accounts WHERE id=$1', [
      session.user.id,
    ])
  ).rows[0];
  assert.equal(account.display_name, name);
  const bypass = await page.request.post(`${base}/api/auth/update-user`, {
    headers: { Origin: base },
    data: { name: 'Bypass' },
  });
  assert.equal(bypass.status(), 404);
  await page.screenshot({
    path: 'artifacts/web/profile-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/profile`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'ملفك الشخصي', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/profile-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/dashboard`);
  console.log(
    'Profile ownership, synchronized display names, disabled bypass and Arabic mobile passed.',
  );
}
