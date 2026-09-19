import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { publishGameweekResults } from '../packages/application/dist/index.js';
export async function exerciseSnapshotRepair(
  page,
  pool,
  base,
  roundId,
  entryId,
) {
  const db = createDatabase(pool);
  const round = (
    await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
      roundId,
    ])
  ).rows[0].data;
  const entry = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entryId])
  ).rows[0].data;
  const snapshot = (
    await pool.query(
      'SELECT payload FROM fantasy.entry_snapshots WHERE entry_id=$1 AND gameweek_id=$2',
      [entryId, roundId],
    )
  ).rows[0].payload;
  const result = (
    await pool.query(
      'SELECT payload FROM fantasy.entry_results WHERE entry_id=$1 AND gameweek_id=$2 AND revision=$3',
      [entryId, roundId, round.resultRevision],
    )
  ).rows[0].payload;
  const corrupted = {
    ...snapshot,
    transferDeduction: snapshot.transferDeduction + 1000,
    roster: { ...snapshot.roster, bank: snapshot.roster.bank + 1 },
  };
  await pool.query(
    'UPDATE fantasy.entry_snapshots SET payload=$1 WHERE entry_id=$2 AND gameweek_id=$3',
    [corrupted, entryId, roundId],
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/results/${roundId}`);
  await page
    .getByRole('link', {
      name: 'Repair a snapshot from acceptance evidence ↗',
      exact: true,
    })
    .click();
  await page.getByLabel('Search squad name', { exact: true }).fill(entry.name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('link', { name: 'Preview snapshot repair ↗', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Recorded and restored choices',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Approve snapshot repair', exact: true }),
  ).toBeVisible();
  assert.equal(
    (
      await pool.query(
        'SELECT count(*) FROM fantasy.entry_snapshot_repairs WHERE gameweek_id=$1',
        [roundId],
      )
    ).rows[0].count,
    '0',
  );
  await page
    .getByRole('heading', {
      name: 'Recorded and restored choices',
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'artifacts/web/snapshot-repair-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${base}/ar/admin/results/${roundId}/repair?entryId=${entryId}`,
  );
  await expect(
    page.getByRole('heading', {
      name: 'الاختيارات المسجلة والمستعادة',
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
    .getByRole('heading', {
      name: 'الاختيارات المسجلة والمستعادة',
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'artifacts/web/snapshot-repair-ar-mobile.png',
    fullPage: true,
  });
  await page
    .getByLabel('سبب إصلاح السجل', { exact: true })
    .fill(
      'Browser proof: restore the actual pre-deadline choices after synthetic lock corruption',
    );
  await page
    .getByLabel(
      'راجعت دليل قبول الاختيارات وأثر الإصلاح على النقاط والترتيب والجوائز.',
      { exact: true },
    )
    .check();
  await page
    .getByRole('button', { name: 'مراجعة إصلاح السجل', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد إصلاح السجل', exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/ar/admin/results/${roundId}`);
  const updated = (
    await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
      roundId,
    ])
  ).rows[0].data;
  assert.equal(updated.resultRevision, round.resultRevision + 1);
  const repair = (
    await pool.query(
      'SELECT data FROM fantasy.entry_snapshot_repairs WHERE gameweek_id=$1 AND entry_id=$2',
      [roundId, entryId],
    )
  ).rows[0].data;
  assert.deepEqual(repair.snapshot, snapshot);
  assert.ok(Date.parse(repair.source.acceptedAt) < Date.parse(round.deadline));
  assert.deepEqual(
    (
      await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [
        entryId,
      ])
    ).rows[0].data,
    entry,
  );
  assert.deepEqual(
    (
      await pool.query(
        'SELECT payload FROM fantasy.entry_snapshots WHERE entry_id=$1 AND gameweek_id=$2',
        [entryId, roundId],
      )
    ).rows[0].payload,
    corrupted,
  );
  const restored = (
    await pool.query(
      'SELECT payload FROM fantasy.entry_results WHERE entry_id=$1 AND gameweek_id=$2 AND revision=$3',
      [entryId, roundId, updated.resultRevision],
    )
  ).rows[0].payload;
  assert.deepEqual(restored, result);
  await page.goto(
    `${base}/en/admin/results/${roundId}/repair?entryId=${entryId}`,
  );
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'This snapshot already matches' }),
  ).toHaveText(
    'This snapshot already matches the latest accepted pre-deadline choices.',
  );
  await expect(
    page.getByRole('heading', {
      name: 'Published repair history',
      exact: true,
    }),
  ).toBeVisible();
  await publishGameweekResults(db, roundId);
  assert.equal(
    (
      await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
        roundId,
      ])
    ).rows[0].data.resultRevision,
    updated.resultRevision,
  );
  const denied = await fetch(`${base}/api/v1/admin/snapshot-repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  assert.ok([401, 403].includes(denied.status));
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'Snapshot repair E2E passed: genuine pre-deadline command, read-only bilingual preview, Arabic confirmation, retained original and later decisions, coherent publication and repair history.',
  );
}
