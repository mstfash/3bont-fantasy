import { waitForVisibleImages } from './browser-images.mjs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseStaff(page, pool, base) {
  const id = `qa-staff-${randomUUID()}`;
  await pool.query(
    'INSERT INTO fantasy.accounts(id,display_name,suspended_until) VALUES($1,$2,NULL)',
    [id, 'QA Staff Target'],
  );
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
    [id, 'QA Staff Target', `${id}@example.test`],
  );
  try {
    await page.goto(`${base}/en/admin/staff?q=${encodeURIComponent(id)}`);
    await expect(
      page.getByRole('heading', { name: 'THE RIGHT ACCESS.' }),
    ).toBeVisible();
    await page.getByLabel('Account', { exact: true }).selectOption(id);
    await page
      .getByLabel('Role', { exact: true })
      .selectOption('support-viewer');
    await page.getByLabel('Scope', { exact: true }).selectOption('');
    await page
      .getByLabel('Reason for granting access')
      .fill('QA reviewed read-only operational access');
    await page
      .getByRole('button', { name: 'Review role grant', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    const row = page.getByRole('row').filter({ hasText: id });
    await expect(
      row.getByRole('cell', { name: 'Support viewer', exact: true }),
    ).toBeVisible();
    const stored = await pool.query(
      'SELECT role,competition_id FROM fantasy.staff_grants WHERE account_id=$1',
      [id],
    );
    assert.equal(stored.rows[0]?.role, 'support-viewer');
    assert.equal(stored.rows[0]?.competition_id, null);
    await page.getByRole('heading', { name: 'THE RIGHT ACCESS.' }).click();
    await waitForVisibleImages(page);
    await page.screenshot({
      path: 'artifacts/web/admin-staff-en.png',
      fullPage: true,
    });
    await page.goto(`${base}/ar/admin/staff`);
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForVisibleImages(page);
    await page.screenshot({
      path: 'artifacts/web/admin-staff-ar-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/en/admin/staff`);
    const target = page.getByRole('row').filter({ hasText: id });
    await target.getByText('Revoke access', { exact: true }).click();
    await target
      .getByLabel('Reason for revoking access')
      .fill('QA access no longer required');
    await target
      .getByRole('button', { name: 'Review revocation', exact: true })
      .click();
    await target
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(target).toHaveCount(0);
    assert.equal(
      (
        await pool.query(
          'SELECT id FROM fantasy.staff_grants WHERE account_id=$1',
          [id],
        )
      ).rowCount,
      0,
    );
  } finally {
    await pool.query('DELETE FROM fantasy.staff_grants WHERE account_id=$1', [
      id,
    ]);
    await pool.query('DELETE FROM fantasy.audit_events WHERE scope_id=$1', [
      id,
    ]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
    await pool.query('DELETE FROM fantasy.accounts WHERE id=$1', [id]);
  }
}
