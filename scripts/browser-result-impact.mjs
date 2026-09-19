import assert from 'node:assert/strict';
import { exerciseGroupImpact } from './browser-group-impact.mjs';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { publishGameweekResults } from '../packages/application/dist/index.js';

export async function exerciseResultImpact(
  page,
  pool,
  db,
  base,
  round,
  fixture,
  entry,
  footballers,
  statistics,
) {
  const player = footballers.find((p) =>
    entry.state.roster.starterIds.includes(p.id),
  );
  assert.ok(player, 'A fixture starter is needed for the correction rehearsal');
  const fact = (
    await pool.query(
      'SELECT revision FROM fantasy.fact_revisions WHERE fixture_id=$1 AND footballer_id=$2 ORDER BY revision DESC LIMIT 1',
      [fixture.id, player.id],
    )
  ).rows[0];
  const response = await page.request.post(`${base}/api/v1/admin/matches`, {
    headers: { Origin: base },
    data: {
      kind: 'override',
      commandId: randomUUID(),
      fixtureId: fixture.id,
      footballerId: player.id,
      expectedRevision: fact.revision,
      reason: 'Synthetic assist correction for impact preview rehearsal',
      change: {
        kind: 'performance',
        statistics: { ...statistics, assists: 1 },
        discipline: { kind: 'none' },
      },
    },
  });
  assert.equal(response.status(), 200);
  assert.equal((await publishGameweekResults(db, round.id)).status, 'review');
  await page.goto(`${base}/en/admin/results/${round.id}`);
  const rankings = page.getByRole('region', {
    name: 'Overall ranking impact',
    exact: true,
  });
  await expect(
    rankings.getByRole('cell', { name: entry.name, exact: true }),
  ).toBeVisible();
  const prizes = page.getByRole('region', {
    name: 'Prizes affected by this gameweek',
    exact: true,
  });
  await expect(prizes.getByText('Prize pools', { exact: true })).toBeVisible();
  await rankings.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'artifacts/web/result-impact-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/admin/results/${round.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  const arabicRankings = page.getByRole('region', {
    name: 'أثر التغيير على الترتيب العام',
    exact: true,
  });
  await expect(
    arabicRankings.getByRole('cell', { name: entry.name, exact: true }),
  ).toBeVisible();
  await arabicRankings.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/result-impact-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/results/${round.id}`);
  await page
    .getByLabel('Reason for approving the reopening')
    .fill(
      'QA reviewed squad scores, overall rank changes and pending prize holds',
    );
  await page
    .getByLabel(
      'I reviewed the impact on squads, standings and affected prize decisions.',
    )
    .check();
  await page
    .getByRole('button', { name: 'REVIEW REOPENING', exact: true })
    .click();
  const accepted = page.waitForResponse(
    (r) =>
      r.url() === `${base}/api/v1/admin/results` &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'CONFIRM REOPENING', exact: true })
    .click();
  assert.equal((await accepted).status(), 200);
  await expect(
    page.getByRole('heading', { name: 'Reopen results', exact: true }),
  ).not.toBeVisible();
  assert.equal(
    (await publishGameweekResults(db, round.id)).status,
    'finalized',
  );
  const audit = (
    await pool.query(
      "SELECT payload FROM fantasy.audit_events WHERE scope_id=$1 AND action='results.reopened'",
      [round.id],
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].payload.impact.prizes.publishedPools, 1);
  await exerciseGroupImpact(page, pool, base);
  console.log(
    'Browser correction impact passed: overall ranks, prize holds, Arabic mobile layout and reviewed reopening.',
  );
}
