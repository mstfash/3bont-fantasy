import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { recordWorkerRun } from '../packages/application/dist/index.js';
export async function exerciseWorkerHealth(page, pool, base) {
  const instance = randomUUID(),
    db = createDatabase(pool);
  try {
    await recordWorkerRun(db, instance, 'game-cycle', async () => ({
      counts: { roundsLocked: 1, entriesSnapshotted: 15 },
      issueCount: 1,
      issues: [{ kind: 'gameweek', id: randomUUID(), code: 'scoring-failed' }],
    }));
    await recordWorkerRun(db, instance, 'maintenance', async () => ({
      counts: {},
      issueCount: 0,
      issues: [],
    }));
    await page.goto(`${base}/en/admin/operations`);
    await expect(
      page.getByRole('heading', { name: 'WORKER HEALTH', exact: true }),
    ).toBeVisible();
    const game = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'Deadlines and results',
        exact: true,
      }),
    });
    await expect(game.getByText('Needs review', { exact: true })).toBeVisible();
    await page
      .locator('details')
      .filter({ hasText: '1 · Run reference' })
      .first()
      .locator('summary')
      .click();
    await expect(
      page.getByText(/Gameweek results could not be processed/u),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/web/worker-health-en.png',
      fullPage: true,
    });
    await page.goto(`${base}/ar/admin/operations`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', { name: 'حالة التشغيل', exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/worker-health-ar-mobile.png',
      fullPage: true,
    });
  } finally {
    await pool.query('DELETE FROM fantasy.worker_runs WHERE instance_id=$1', [
      instance,
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin`);
  console.log(
    'Worker run visibility, actionable issues, references and Arabic mobile passed.',
  );
}
