import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exercisePriceCalibration(page, pool, base) {
  const competition = (
    await pool.query(
      "SELECT id FROM fantasy.competitions WHERE slug='cairo-replay'",
    )
  ).rows[0];
  assert.ok(
    competition,
    'Run the synthetic replay before browser verification',
  );
  let reportId;
  try {
    const url = `/en/admin/competitions/${competition.id}/prices/calibration`;
    await page.goto(`${base}${url}`);
    await expect(
      page.getByRole('heading', { name: 'TEST BEFORE REPRICING.' }),
    ).toBeVisible();
    await page.getByLabel('Observed gameweeks', { exact: true }).fill('1');
    await page
      .getByLabel('Reason for this experiment', { exact: true })
      .fill('QA synthetic calibration; no production readiness claim');
    await page
      .getByRole('button', { name: 'REVIEW PRICE EXPERIMENT', exact: true })
      .click();
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/prices/calibration') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    const saved = await savedResponse;
    const body = await saved.json();
    reportId = body.result?.reportId;
    assert.equal(saved.status(), 200);
    assert.ok(reportId);
    await page.waitForURL('**/calibration?report=*');
    reportId = new URL(page.url()).searchParams.get('report');
    assert.ok(reportId);
    await expect(page.getByTestId('calibration-report')).toBeVisible();
    await expect(
      page.getByText(
        'Synthetic rehearsal data — not evidence of real-season readiness.',
      ),
    ).toBeVisible();
    const downloadUrl = `${base}/api/v1/admin/prices/calibration?competition=${competition.id}&report=${reportId}`;
    const response = await page.request.get(downloadUrl);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cache-control'], 'no-store');
    const report = await response.json();
    assert.equal(report.id, reportId);
    assert.equal(report.basis.synthetic, true);
    assert.equal(report.output.results.length, 2);
    assert.ok(report.basis.rounds.some((r) => r.finalizedAt));
    assert.equal((await fetch(downloadUrl)).status, 401);
    await page.screenshot({
      path: 'artifacts/web/price-calibration-en.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `${base}/ar/admin/competitions/${competition.id}/prices/calibration?report=${reportId}`,
    );
    await expect(
      page.getByRole('heading', { name: 'اختبر. قبل التسعير.' }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: 'artifacts/web/price-calibration-ar-mobile.png',
      fullPage: true,
    });
    console.log(
      'Price calibration: reviewed experiment, saved evidence, anonymous denial and Arabic mobile verified',
    );
  } finally {
    if (reportId) {
      await pool.query(
        'DELETE FROM fantasy.price_calibration_sources WHERE report_id=$1',
        [reportId],
      );
      await pool.query(
        'DELETE FROM fantasy.price_calibration_runs WHERE id=$1',
        [reportId],
      );
      await pool.query(
        "DELETE FROM fantasy.commands WHERE result->>'reportId'=$1",
        [reportId],
      );
      await pool.query(
        "DELETE FROM fantasy.audit_events WHERE action='prices.calibration-saved' AND payload->>'reportId'=$1",
        [reportId],
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}
