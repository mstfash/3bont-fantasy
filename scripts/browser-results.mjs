import { exerciseHistoricalRules } from './browser-historical-rules.mjs';
import { reviewedMatchPost } from './browser-match-review.mjs';
import assert from 'node:assert/strict';
import { exerciseResultImpact } from './browser-result-impact.mjs';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { Temporal } from '../apps/web/node_modules/@js-temporal/polyfill/dist/index.esm.js';
import { createDatabase } from '../packages/persistence/dist/index.js';
import {
  advanceDueGameweeks,
  publishGameweekResults,
} from '../packages/application/dist/index.js';

export async function exerciseRoundResults(
  page,
  pool,
  base,
  slug,
  cleanupFixtures,
) {
  const session = await (
    await page.request.get(`${base}/api/auth/get-session`)
  ).json();
  const competition = (
    await pool.query('SELECT data FROM fantasy.competitions WHERE slug=$1', [
      slug,
    ])
  ).rows[0].data;
  const round = (
    await pool.query(
      'SELECT data FROM fantasy.gameweeks WHERE competition_id=$1 ORDER BY number',
      [competition.id],
    )
  ).rows[0].data;
  const original = (
    await pool.query(
      'SELECT data FROM fantasy.entries WHERE account_id=$1 AND competition_id<>$2',
      [session.user.id, competition.id],
    )
  ).rows[0].data;
  const quotes = (
    await pool.query(
      'SELECT data FROM fantasy.competition_players WHERE competition_id=$1',
      [competition.id],
    )
  ).rows.map((p) => p.data);
  const roster = original.state.roster;
  const created = await page.request.post(`${base}/api/v1/entries`, {
    headers: { Origin: base },
    data: {
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      gameweekId: round.id,
      name: 'QA Scoring XI',
      lineup: {
        starterIds: roster.starterIds,
        reserveIds: roster.reserveIds,
        captaincy: roster.captaincy,
      },
      players: roster.holdings.map((h) => ({
        footballerId: h.footballerId,
        priceRevision: quotes.find((q) => q.footballerId === h.footballerId)
          .priceRevision,
      })),
    },
  });
  assert.equal(created.status(), 200);
  const entry = (await created.json()).entry;
  const sourceFixture = (
    await pool.query(
      'SELECT f.data FROM fantasy.fixtures f JOIN fantasy.fixture_assignments a ON a.fixture_id=f.id WHERE a.gameweek_id=$1',
      [round.id],
    )
  ).rows[0].data;
  const fixture = { ...sourceFixture, id: randomUUID(), revision: 1 };
  cleanupFixtures.push(fixture.id);
  await pool.query(
    'INSERT INTO fantasy.fixtures(id,season_id,kickoff,data) VALUES($1,$2,$3,$4)',
    [fixture.id, fixture.seasonId, fixture.kickoff, fixture],
  );
  await pool.query(
    'UPDATE fantasy.fixture_assignments SET fixture_id=$1 WHERE competition_id=$2 AND gameweek_id=$3',
    [fixture.id, competition.id, round.id],
  );
  const deadline = new Date(Date.now() - 1000).toISOString();
  await pool.query(
    'UPDATE fantasy.gameweeks SET deadline=$1,data=$2 WHERE id=$3',
    [
      deadline,
      {
        ...round,
        deadline,
        rules: { ...round.rules, correctionWindowHours: 0 },
      },
      round.id,
    ],
  );
  const db = createDatabase(pool);
  assert.equal((await advanceDueGameweeks(db, competition.id)).locked, 1);
  assert.equal(
    (await publishGameweekResults(db, round.id)).status,
    'provisional',
  );
  // Exercise the real report UI first. Unknown statistics must not finalize the round.
  await page.goto(`${base}/en/admin/matches/${fixture.id}`);
  await page
    .getByLabel('Match status', { exact: true })
    .selectOption('finished');
  await page.getByLabel('Home goals', { exact: true }).fill('0');
  await page.getByLabel('Away goals', { exact: true }).fill('0');
  await page
    .getByLabel(
      'The eligibility roster is complete, including non-appearances.',
    )
    .check();
  await page
    .getByLabel('All match data required for scoring is complete.')
    .check();
  for (const checkbox of await page
    .locator('fieldset input[type=checkbox]')
    .all())
    await checkbox.check();
  await page
    .getByLabel('Reason and evidence source')
    .fill('Browser proof: reviewed synthetic fixture roster');
  await page
    .getByRole('button', { name: 'REVIEW REPORT', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Shared match impact', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'CONFIRM & SAVE', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'CONFIRM & SAVE', exact: true }),
  ).not.toBeVisible();
  assert.equal(
    (await publishGameweekResults(db, round.id)).status,
    'provisional',
  );
  const recorded = (
    await pool.query('SELECT data FROM fantasy.fixtures WHERE id=$1', [
      fixture.id,
    ])
  ).rows[0].data;
  const footballers = (
    await pool.query(
      'SELECT data FROM fantasy.footballers WHERE season_id=$1 AND club_id IN ($2,$3)',
      [fixture.seasonId, fixture.homeClubId, fixture.awayClubId],
    )
  ).rows.map((r) => r.data);
  const statistics = {
    minutes: 90,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltyMisses: 0,
    concededWhileOnPitch: 0,
    concededAfterDismissal: 0,
    savesIncludingPenalties: 0,
    penaltySaves: 0,
  };
  const imported = await reviewedMatchPost(page, base, {
    kind: 'import',
    commandId: randomUUID(),
    expectedRevision: recorded.revision,
    source: 'browser-synthetic-fixture',
    reason: 'Completed synthetic statistics for browser verification',
    observation: {
      fixture: recorded,
      eligibilityComplete: true,
      eligibleFootballerIds: footballers.map((p) => p.id),
      performances: footballers.map((p) => ({
        footballerId: p.id,
        statistics,
        discipline: { kind: 'none' },
      })),
    },
  });
  assert.equal(imported.status(), 200);
  assert.equal(
    (await publishGameweekResults(db, round.id)).status,
    'finalized',
  );
  await exerciseResultImpact(
    page,
    pool,
    db,
    base,
    round,
    fixture,
    entry,
    footballers,
    statistics,
  );
  await page.goto(`${base}/en/competitions/${slug}/standings`);
  await expect(
    page.getByRole('link', { name: 'QA Scoring XI ↗', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'QA Scoring XI ↗', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'QA Scoring XI', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Final result', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/web/results-en.png',
    fullPage: true,
  });
  await page.goto(`${base}/ar/competitions/${slug}/results/${entry.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/results-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/competitions/${competition.id}`);
  const rounds = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: 'Gameweeks & fixtures',
      exact: true,
    }),
  });
  await rounds.getByLabel('Deadline — Cairo time', { exact: true }).fill(
    Temporal.Instant.fromEpochMilliseconds(Date.now() + 30 * 86400_000)
      .toZonedDateTimeISO('Africa/Cairo')
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' }),
  );
  await rounds
    .getByLabel('Reason for change or reassignment')
    .fill('Browser proof: extend the calendar for the next editing window');
  await rounds
    .getByRole('button', { name: 'REVIEW GAMEWEEK', exact: true })
    .click();
  await rounds
    .getByRole('button', { name: 'CONFIRM & SAVE', exact: true })
    .click();
  await expect(
    rounds.getByRole('button', { name: 'CONFIRM & SAVE', exact: true }),
  ).not.toBeVisible();
  const beforePrices = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entry.id])
  ).rows[0].data;
  assert.notEqual(beforePrices.editingGameweekId, round.id);
  await page.goto(`${base}/en/admin/competitions/${competition.id}/prices`);
  await page
    .getByLabel('Reason for approving this batch')
    .fill('Browser proof: reviewed first-round hold decisions');
  await page
    .getByLabel('I reviewed the prices, score sources and impact.')
    .check();
  await page
    .getByRole('button', { name: 'REVIEW PUBLICATION', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'CONFIRM PRICE PUBLICATION', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'already been published',
  );
  const afterPrices = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entry.id])
  ).rows[0].data;
  assert.deepEqual(
    afterPrices.state.roster,
    beforePrices.state.roster,
    'Price batches must not rewrite existing holdings or bank',
  );
  await page.screenshot({
    path: 'artifacts/web/admin-prices-en.png',
    fullPage: true,
  });
  await exerciseHistoricalRules(page, pool, base, round.id, slug);
  await page.goto(`${base}/en/admin`);
  console.log(
    'Browser calendar extension and reviewed price-batch publication passed.',
  );
  console.log(
    'Browser deadline lock, match report, incomplete-data gate, finalized standings and bilingual score details passed.',
  );
}
