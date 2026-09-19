import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { publishGameweekResults } from '../packages/application/dist/index.js';
import { reviewedMatchPost } from './browser-match-review.mjs';
export async function exerciseExceptionalFixtures(
  page,
  pool,
  base,
  roundId,
  fixtureId,
) {
  const db = createDatabase(pool);
  const before = (
    await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
      roundId,
    ])
  ).rows[0].data;
  const report = (
    await pool.query(
      'SELECT payload FROM fantasy.fixture_observations WHERE fixture_id=$1 ORDER BY revision DESC LIMIT 1',
      [fixtureId],
    )
  ).rows[0].payload;
  const snapshots = (
    await pool.query(
      'SELECT entry_id,payload FROM fantasy.entry_snapshots WHERE gameweek_id=$1 ORDER BY entry_id',
      [roundId],
    )
  ).rows;
  async function proposal(locale) {
    const ar = locale === 'ar';
    await page.goto(`${base}/${locale}/admin/matches/${fixtureId}`);
    await page
      .getByLabel(ar ? 'نوع القرار' : 'Disposition', { exact: true })
      .selectOption('awarded');
    await page
      .getByLabel(ar ? 'أهداف صاحب الأرض الإدارية' : 'Awarded home goals', {
        exact: true,
      })
      .fill('3');
    await page
      .getByLabel(ar ? 'أهداف الضيف الإدارية' : 'Awarded away goals', {
        exact: true,
      })
      .fill('0');
    await page
      .getByLabel(ar ? 'مرجع القرار الرسمي' : 'Official decision reference', {
        exact: true,
      })
      .fill('Synthetic official awarded-result bulletin');
    await page
      .getByLabel(ar ? 'سبب القرار' : 'Disposition reason', { exact: true })
      .fill(
        'Browser proof: administrative team score without footballer performance',
      );
    await page
      .getByRole('button', {
        name: ar ? 'معاينة القرار' : 'PREVIEW DISPOSITION',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: ar ? 'تأكيد القرار الرسمي' : 'CONFIRM DISPOSITION',
        exact: true,
      }),
    ).toBeVisible();
  }
  await proposal('en');
  assert.equal(
    (
      await pool.query('SELECT data FROM fantasy.fixtures WHERE id=$1', [
        fixtureId,
      ])
    ).rows[0].data.status,
    'finished',
  );
  await page.screenshot({
    path: 'artifacts/web/fixture-disposition-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await proposal('ar');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/fixture-disposition-ar-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'تأكيد القرار الرسمي', exact: true })
    .click();
  await expect(
    page.getByText('القرار الرسمي ساري.', { exact: false }),
  ).toBeVisible();
  const awarded = (
    await pool.query('SELECT data FROM fantasy.fixtures WHERE id=$1', [
      fixtureId,
    ])
  ).rows[0].data;
  assert.equal(awarded.status, 'awarded');
  assert.equal(awarded.homeGoals, 3);
  assert.equal((await publishGameweekResults(db, roundId)).status, 'review');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/results/${roundId}`);
  await page
    .getByRole('link', {
      name: 'Preview zero-performance settlement ↗',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Approve zero-performance settlement',
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM fantasy.empty_round_settlements WHERE gameweek_id=$1',
        [roundId],
      )
    ).rows[0].n,
    0,
  );
  await page.screenshot({
    path: 'artifacts/web/empty-gameweek-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/ar/admin/results/${roundId}/empty`);
  await expect(
    page.getByRole('heading', { name: 'اعتماد تسوية الجولة', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByLabel('سبب تسوية الجولة', { exact: true })
    .fill(
      'Browser proof: every fixture has an evidenced zero-performance outcome',
    );
  await page
    .getByLabel('راجعت جميع المباريات والقرارات والنقاط والجوائز المتأثرة.', {
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: 'مراجعة التسوية', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد تسوية الجولة', exact: true })
    .click();
  await page.waitForURL(`${base}/ar/admin/results/${roundId}`);
  const settled = (
    await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
      roundId,
    ])
  ).rows[0].data;
  assert.equal(settled.resultRevision, before.resultRevision + 1);
  const results = (
    await pool.query(
      'SELECT payload FROM fantasy.entry_results WHERE gameweek_id=$1 AND revision=$2',
      [roundId, settled.resultRevision],
    )
  ).rows;
  assert.ok(
    results.every(
      (r) =>
        r.payload.playersTotal === 0 &&
        r.payload.total === -r.payload.transferDeduction,
    ),
  );
  assert.deepEqual(
    (
      await pool.query(
        'SELECT entry_id,payload FROM fantasy.entry_snapshots WHERE gameweek_id=$1 ORDER BY entry_id',
        [roundId],
      )
    ).rows,
    snapshots,
  );
  // Restore the proved sporting result through the reviewed release/report/reopening workflows.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/matches/${fixtureId}`);
  await page
    .getByLabel('Official decision reference', { exact: true })
    .fill('Synthetic reversal bulletin restoring the original sporting result');
  await page
    .getByLabel('Disposition reason', { exact: true })
    .fill(
      'Browser proof: release the disposition before reaccepting the cumulative report',
    );
  await page
    .getByRole('button', { name: 'PREVIEW DISPOSITION', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'CONFIRM DISPOSITION', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Match report', exact: true }),
  ).toBeVisible();
  const current = (
    await pool.query('SELECT data FROM fantasy.fixtures WHERE id=$1', [
      fixtureId,
    ])
  ).rows[0].data;
  const accepted = await reviewedMatchPost(page, base, {
    kind: 'import',
    commandId: randomUUID(),
    expectedRevision: current.revision,
    source: 'browser-proof',
    reason:
      'Restore the complete original sporting report after official reversal',
    observation: {
      ...report,
      fixture: { ...report.fixture, revision: current.revision },
    },
  });
  assert.equal(accepted.status(), 200);
  await publishGameweekResults(db, roundId);
  await page.goto(`${base}/en/admin/results/${roundId}`);
  await page
    .getByLabel('Reason for approving the reopening')
    .fill(
      'Browser proof: restore sporting points after reviewing the official reversal',
    );
  await page
    .getByLabel(
      'I reviewed the impact on squads, standings and affected prize decisions.',
    )
    .check();
  await page
    .getByRole('button', { name: 'REVIEW REOPENING', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'CONFIRM REOPENING', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Reopen results', exact: true }),
  ).toHaveCount(0);
  assert.equal((await publishGameweekResults(db, roundId)).status, 'finalized');
  console.log(
    'Exceptional fixture E2E passed: reviewed awarded result, no invented performance, bilingual explicit settlement, preserved squads, release and cumulative-report restoration.',
  );
}
