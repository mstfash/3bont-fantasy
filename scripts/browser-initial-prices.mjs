import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseInitialPrices(page, pool, base, competitionId) {
  const beforeRevision = (
    await pool.query('SELECT revision FROM fantasy.competitions WHERE id=$1', [
      competitionId,
    ])
  ).rows[0].revision;
  const originals = (
    await pool.query(
      'SELECT f.id,f.data FROM fantasy.footballers f JOIN fantasy.competitions c ON c.season_id=f.season_id WHERE c.id=$1 ORDER BY f.id LIMIT 2',
      [competitionId],
    )
  ).rows;
  assert.equal(originals.length, 2);
  assert.ok(originals.every((p) => p.data.synthetic));
  try {
    for (const [index, p] of originals.entries())
      await pool.query('UPDATE fantasy.footballers SET data=$2 WHERE id=$1', [
        p.id,
        {
          ...p.data,
          valuation: {
            amountMinor: (index + 1) * 100000,
            currency: 'EUR',
            asOf: new Date().toISOString(),
            sourceName: 'Fictional browser valuation proof',
            sourceUrl: 'https://example.com/synthetic-browser-proof',
            licensedForDisplay: true,
          },
        },
      ]);
    await page.reload();
    await page
      .getByLabel(`Pin price ${originals[0].data.name.en}`, { exact: true })
      .check();
    const suggestion = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'SUGGEST STARTING PRICES',
        exact: true,
      }),
    });
    for (const position of ['GK', 'DEF', 'MID', 'FWD']) {
      await suggestion.locator(`[name="${position}-min"]`).fill('4');
      await suggestion.locator(`[name="${position}-max"]`).fill('4');
    }
    await suggestion
      .getByRole('button', { name: 'Calculate suggestions', exact: true })
      .click();
    await expect(
      suggestion.getByText('Pinned — retained', { exact: true }),
    ).toBeVisible();
    await suggestion.screenshot({
      path: 'artifacts/web/initial-prices-en.png',
    });
    await suggestion
      .getByRole('button', {
        name: 'Stage suggestions for review',
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(`Price ${originals[0].data.name.en}`, { exact: true }),
    ).toHaveValue('5');
    await expect(
      page.getByLabel(`Price ${originals[1].data.name.en}`, { exact: true }),
    ).toHaveValue('4');
    const players = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: 'Player pool & fantasy prices',
        exact: true,
      }),
    });
    await players
      .getByLabel('Reason for change', { exact: true })
      .fill(
        'Browser proof: reviewed valuation suggestions, retained pin and manual defaults',
      );
    await players
      .getByRole('button', { name: 'REVIEW PLAYER POOL', exact: true })
      .click();
    await players
      .getByRole('button', { name: 'CONFIRM & SAVE', exact: true })
      .click();
    await expect(page.locator('.admin-title .eyebrow')).toContainText(
      `REVISION ${String(beforeRevision + 1)}`,
    );
    const audit = (
      await pool.query(
        "SELECT payload FROM fantasy.audit_events WHERE scope_id=$1 AND action='competition.setup.pool' ORDER BY created_at DESC LIMIT 1",
        [competitionId],
      )
    ).rows[0].payload;
    assert.equal(
      audit.initialPriceEvidence.calculationVersion,
      'valuation-midrank-v1',
    );
    assert.equal(
      audit.initialPriceEvidence.sources.find((p) => p.id === originals[1].id)
        .valuation.sourceName,
      'Fictional browser valuation proof',
    );
    await page.goto(`${base}/ar/admin/competitions/${competitionId}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'حساب الاقتراحات', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'نقل الاقتراحات للمراجعة',
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .locator('section')
      .filter({
        has: page.getByRole('heading', {
          name: 'اقتراح أسعار البداية',
          exact: true,
        }),
      })
      .screenshot({ path: 'artifacts/web/initial-prices-ar-mobile.png' });
  } finally {
    for (const p of originals)
      await pool.query('UPDATE fantasy.footballers SET data=$2 WHERE id=$1', [
        p.id,
        p.data,
      ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin/competitions/${competitionId}`);
  console.log(
    'Initial valuation suggestions, pinned-price retention, reviewed publication, retained sources and Arabic mobile passed.',
  );
}
