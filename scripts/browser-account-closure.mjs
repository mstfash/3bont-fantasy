import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
export async function exerciseAccountClosure(
  page,
  pool,
  base,
  accountId,
  entryId,
  email,
  password,
) {
  await page.goto(`${base}/en/profile/close`);
  await expect(
    page.getByText('Retire this entry first', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'REVIEW PERMANENT CLOSURE', exact: true }),
  ).toHaveCount(0);
  const entry = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entryId])
  ).rows[0].data;
  const retire = await page.request.post(`${base}/api/v1/entries/lifecycle`, {
    headers: { Origin: base },
    data: {
      kind: 'retire',
      commandId: randomUUID(),
      competitionId: entry.competitionId,
      entryId,
      expectedRevision: entry.revision,
    },
  });
  assert.equal(retire.status(), 200);
  const archive = await page.request.post(`${base}/api/v1/account/exports`, {
    headers: { Origin: base },
    data: {
      commandId: randomUUID(),
      scope: { competitionId: null, historyFrom: null, historyUntil: null },
    },
  });
  assert.equal(archive.status(), 200);
  await page.goto(`${base}/ar/profile/close`);
  await expect(
    page.getByRole('button', { name: 'مراجعة الإغلاق النهائي', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/account-closure-ar-mobile.png',
    fullPage: true,
  });
  await page.goto(`${base}/en/profile/close`);
  await page.getByLabel('Type CLOSE', { exact: true }).fill('CLOSE');
  await page
    .getByRole('button', { name: 'REVIEW PERMANENT CLOSURE', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'YOUR ACCOUNT IS CLOSED', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/web/account-closure-en.png',
    fullPage: true,
  });
  const account = (
    await pool.query(
      'SELECT closed_at,display_name FROM fantasy.accounts WHERE id=$1',
      [accountId],
    )
  ).rows[0];
  assert.ok(account.closed_at);
  assert.match(account.display_name, /Closed participant/);
  assert.equal(
    (await pool.query('SELECT id FROM "user" WHERE id=$1', [accountId]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query('SELECT id FROM "account" WHERE "userId"=$1', [
        accountId,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM fantasy.account_exports WHERE account_id=$1',
        [accountId],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await page.request.post(`${base}/api/v1/profile`, {
        headers: { Origin: base },
        data: {},
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await page.request.post(`${base}/api/auth/sign-in/email`, {
        headers: { Origin: base },
        data: { email, password },
      })
    ).status(),
    401,
  );
  console.log(
    'Reviewed account closure, active-entry blocker, private archive purge, credential deletion, revoked session and Arabic mobile passed.',
  );
}
