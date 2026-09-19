import { waitForVisibleImages } from './browser-images.mjs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseSupport(page, pool, base, competitionId) {
  await page.goto(`${base}/en/admin/support?competition=${competitionId}`);
  await expect(
    page.getByRole('heading', {
      name: 'EVERY STATUS. EXPLAINED.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'QA Scoring XI', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Final', exact: true }),
  ).toBeVisible();
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/admin-support-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/admin/support?competition=${competitionId}`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await waitForVisibleImages(page);
  await page.screenshot({
    path: 'artifacts/web/admin-support-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/moderation`);
  await expect(
    page.getByRole('heading', { name: 'QA Private Friends', exact: true }),
  ).toBeVisible();
  const target = `qa-moderation-${randomUUID()}`;
  await pool.query(
    'INSERT INTO fantasy.accounts(id,display_name) VALUES($1,$2)',
    [target, 'QA Account Review'],
  );
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
    [target, 'QA Account Review', `${target}@example.test`],
  );
  await pool.query(
    'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',
    [randomUUID(), randomUUID(), target],
  );
  try {
    await page.goto(
      `${base}/en/admin/accounts?q=${encodeURIComponent(target)}`,
    );
    await expect(
      page.getByRole('heading', { name: 'QA Account Review', exact: true }),
    ).toBeVisible();
    const until = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date(Date.now() + 3600_000))
      .replace(' ', 'T');
    await page.getByLabel('Suspension ends — Cairo time').fill(until);
    await page
      .getByLabel('Decision reason')
      .fill('QA reviewed temporary account suspension');
    await page.getByLabel('Evidence reference').fill('QA private case 200');
    await page
      .getByRole('button', { name: 'Review account decision', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Saved.');
    assert.ok(
      (
        await pool.query(
          'SELECT suspended_until FROM fantasy.accounts WHERE id=$1',
          [target],
        )
      ).rows[0].suspended_until,
    );
    assert.equal(
      (
        await pool.query('SELECT count(*) FROM "session" WHERE "userId"=$1', [
          target,
        ])
      ).rows[0].count,
      '0',
    );
    await page.screenshot({
      path: 'artifacts/web/admin-account-review-en.png',
      fullPage: true,
    });
    await page.getByLabel('Account action').selectOption('restore');
    await page
      .getByLabel('Decision reason')
      .fill('QA restore account after completed review');
    await page
      .getByRole('button', { name: 'Review account decision', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      page.getByText('Access available', { exact: true }),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query(
          'SELECT suspended_until FROM fantasy.accounts WHERE id=$1',
          [target],
        )
      ).rows[0].suspended_until,
      null,
    );
  } finally {
    await pool.query('DELETE FROM "session" WHERE "userId"=$1', [target]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [target]);
    await pool.query('DELETE FROM fantasy.accounts WHERE id=$1', [target]);
  }
  await page.goto(`${base}/en/admin`);
  console.log(
    'Scoped support, Arabic mobile, staff report queue and reviewed account suspension/restoration passed.',
  );
}
