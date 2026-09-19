import { exerciseProviderIdentities } from './browser-provider-identities.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { fetchProviderResource } from '../packages/application/dist/index.js';
const wall = (date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(' ', 'T');
export async function exerciseProviders(page, pool, base) {
  assert.equal(
    (await pool.query('SELECT id FROM fantasy.provider_accounts')).rows.length,
    0,
    'Provider browser proof requires an unconfigured local provider account',
  );
  let id = null;
  try {
    await page.goto(`${base}/en/admin/providers`);
    const configure = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'CONFIRMED LIMITS',
        exact: true,
      }),
    });
    await configure
      .getByLabel('Daily request limit', { exact: true })
      .fill('10');
    await configure
      .getByLabel('Requests per minute', { exact: true })
      .fill('10');
    await configure
      .getByLabel('Last confirmed reset instant — Cairo time')
      .fill(wall(new Date(Date.now() - 3600000)));
    await configure
      .getByLabel(
        'This key is dedicated to this deployment and is not shared with other apps.',
      )
      .check();
    await configure
      .getByLabel('Limit and reset evidence reference')
      .fill('QA synthetic provider only; not a real subscription');
    await configure
      .getByLabel('Settings change reason')
      .fill('QA reviewed configuration without outbound traffic');
    await configure
      .getByRole('button', { name: 'Review provider settings', exact: true })
      .click();
    await configure
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    const reconcile = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'RECONCILE USAGE',
        exact: true,
      }),
    });
    await expect(reconcile).toBeVisible();
    id = (await pool.query('SELECT id FROM fantasy.provider_accounts')).rows[0]
      .id;
    await reconcile.getByLabel('Total requests already used').fill('0');
    await reconcile
      .getByLabel('Usage evidence reference')
      .fill('QA synthetic provider usage fixture');
    await reconcile
      .getByLabel('Reconciliation reason')
      .fill('QA reconcile before controlled fake transport');
    await reconcile
      .getByLabel(
        'I checked this window and actual usage in the provider dashboard.',
      )
      .check();
    await reconcile
      .getByRole('button', { name: 'Review enabling requests', exact: true })
      .click();
    await reconcile
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'REQUESTS ENABLED WITHIN LIMITS',
        exact: true,
      }),
    ).toBeVisible();
    // Advance only this synthetic account's cooldown; no live provider transport is used.
    await pool.query(
      'UPDATE fantasy.provider_accounts SET cooldown_until=NULL WHERE id=$1',
      [id],
    );
    const db = createDatabase(pool);
    const result = await fetchProviderResource(
      db,
      {
        accountId: id,
        request: { resource: 'status' },
        priority: 'ordinary',
        apiKey: 'qa-synthetic-provider-key',
      },
      async () =>
        Response.json(
          {
            get: 'status',
            parameters: [],
            errors: [],
            results: 1,
            paging: { current: 1, total: 1 },
            response: { synthetic: true },
          },
          {
            headers: {
              'x-ratelimit-requests-limit': '10',
              'x-ratelimit-requests-remaining': '9',
            },
          },
        ),
    );
    assert.equal(result.outcome, 'success');
    await page.reload();
    await expect(
      page.getByRole('cell', { name: 'Success', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/web/provider-operations-en.png',
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Review evidence', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'SAVED SOURCE EVIDENCE', exact: true }),
    ).toBeVisible();
    await expect(page.locator('pre')).toContainText('synthetic');
    const download = await page
      .getByRole('link', { name: 'Download redacted evidence' })
      .getAttribute('href');
    assert.ok(download);
    const response = await page.request.get(`${base}${download}`);
    assert.equal(response.status(), 200);
    assert.equal((await fetch(`${base}${download}`)).status, 401);
    assert.equal(response.headers()['cache-control'], 'no-store');
    assert.equal(
      (await response.json()).evidence.payload.response.synthetic,
      true,
    );
    await page.screenshot({
      path: 'artifacts/web/provider-evidence-en.png',
      fullPage: true,
    });
    await page.goto(page.url().replace('/en/', '/ar/'));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', { name: 'دليل المصدر المحفوظ', exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/provider-evidence-ar-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await exerciseProviderIdentities(page, pool, db, base, id);
    const pause = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'PAUSE REQUESTS', exact: true }),
    });
    await pause
      .getByLabel('Pause reason')
      .fill('QA end synthetic provider verification');
    await pause
      .getByRole('button', { name: 'Review pausing provider', exact: true })
      .click();
    await pause
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'REQUESTS PAUSED', exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/ar/admin/providers`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', { name: 'الطلبات متوقفة', exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/provider-operations-ar-mobile.png',
      fullPage: true,
    });
  } finally {
    const target =
      id ??
      (
        await pool.query(
          "SELECT id FROM fantasy.provider_accounts WHERE data->>'evidenceReference' LIKE 'QA synthetic provider%'",
        )
      ).rows[0]?.id;
    if (target) {
      const evidence = (
        await pool.query(
          'SELECT evidence_id FROM fantasy.provider_attempts WHERE account_id=$1',
          [target],
        )
      ).rows
        .map((r) => r.evidence_id)
        .filter(Boolean);
      await pool.query(
        'DELETE FROM fantasy.provider_attempts WHERE account_id=$1',
        [target],
      );
      await pool.query(
        'DELETE FROM fantasy.provider_quota_windows WHERE account_id=$1',
        [target],
      );
      await pool.query('DELETE FROM fantasy.provider_accounts WHERE id=$1', [
        target,
      ]);
      await pool.query('DELETE FROM fantasy.audit_events WHERE scope_id=$1', [
        target,
      ]);
      if (evidence.length)
        await pool.query(
          'DELETE FROM fantasy.provider_evidence WHERE id=ANY($1::uuid[])',
          [evidence],
        );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin`);
  console.log(
    'Provider settings, reviewed quota reconciliation, synthetic charged attempt, pausing and Arabic mobile layout passed.',
  );
}
