import { exerciseHomeBoard } from './browser-home-board.mjs';
import { exerciseAdminLayout } from './browser-admin-layout.mjs';
import { withAuthRateLimit } from './browser-auth-retry.mjs';
import { monitorPageHealth } from './browser-health.mjs';
import { exerciseProviderNormalization } from './browser-provider-normalization.mjs';
import { exercisePriceCalibration } from './browser-price-calibration.mjs';
import { exerciseAccountExports } from './browser-account-exports.mjs';
import { exerciseProfile } from './browser-profile.mjs';
import { exerciseWorkerHealth } from './browser-worker-health.mjs';
import { exerciseCatalogueImport } from './browser-catalogue-import.mjs';
import { exerciseProviders } from './browser-providers.mjs';
import { exercisePrizeCorrections } from './browser-prize-corrections.mjs';
import { exerciseEntryLifecycle } from './browser-entry-lifecycle.mjs';
import { exerciseSponsors } from './browser-sponsors.mjs';
import { exerciseSupport } from './browser-support.mjs';
import {
  createBrowserAchievement,
  verifyBrowserAchievement,
} from './browser-achievements.mjs';
import {
  createBrowserPrize,
  verifyPrizeSelfAwardHold,
} from './browser-prizes.mjs';
import { exerciseChipGrants } from './browser-chip-grants.mjs';
import { exerciseStaff } from './browser-staff.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import pg from '../packages/persistence/node_modules/pg/lib/index.js';
import { TOTP, Secret } from 'otpauth';
import { exerciseRoundResults } from './browser-results.mjs';
import { exerciseCompetitionSetup } from './browser-admin.mjs';
import { exerciseCatalogue } from './browser-catalogue.mjs';
import { exerciseGroups } from './browser-groups.mjs';

loadEnvFile(new URL('../.env.local', import.meta.url));
if (
  process.env.APP_ENV !== 'local' ||
  process.env.MAIL_MODE !== 'local' ||
  new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('This smoke test is local-only');
const base = 'http://127.0.0.1:3100';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(30_000);
const assertHealthy = monitorPageHealth(page, base);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const email = `qa-${randomUUID()}@example.test`;
const cleanupFixtures = [];
const cleanupSeasons = [];
const competitionSlug = `qa-${randomUUID()}`;
const password = `Qa-${randomBytes(18).toString('hex')}`;
async function submitAuthWithinLimit(path, label) {
  const response = await withAuthRateLimit(async () => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${base}${path}` &&
        response.request().method() === 'POST',
    );
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    return responsePromise;
  });
  assert.equal(response.status(), 200);
}
async function signInWithinLimit() {
  await submitAuthWithinLimit('/api/auth/sign-in/email', 'Sign in');
}
async function mailLink(subject, excluded = new Set()) {
  for (const file of await readdir(process.env.MAIL_OUTBOX_DIR)) {
    if (excluded.has(file)) continue;
    const mail = JSON.parse(
      await readFile(`${process.env.MAIL_OUTBOX_DIR}/${file}`, 'utf8'),
    );
    if (mail.to === email && mail.subject.includes(subject)) {
      const match = mail.text.match(/http:\/\/127\.0\.0\.1:3100\/\S+/u);
      assert.ok(match);
      return match[0];
    }
  }
  throw new Error('Expected local email was not written');
}
try {
  await mkdir('artifacts/web', { recursive: true });
  await exerciseHomeBoard(page, pool, base);
  await page.goto(`${base}/en/register`);
  await page.getByLabel('Your name').fill('Browser QA');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await submitAuthWithinLimit('/api/auth/sign-up/email', 'Create account');
  await expect(page.getByRole('status')).toContainText('Account created');
  const unverified = await page.request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email, password },
  });
  assert.equal(unverified.status(), 403);
  const olderVerificationMail = new Set(
    await readdir(process.env.MAIL_OUTBOX_DIR),
  );
  await page.goto(`${base}/en/login`);
  await page
    .getByRole('link', { name: 'Resend verification email', exact: true })
    .click();
  await page.waitForURL('**/en/resend-verification');
  await expect(
    page.getByRole('heading', { name: 'ACTIVATE YOUR ACCOUNT.', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page
    .getByRole('button', { name: 'Send verification email', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'If this address needs verification',
  );
  const renewedVerificationLink = await mailLink(
    'Verify email',
    olderVerificationMail,
  );
  await page.goto(`${base}/ar/resend-verification`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'فعّل حسابك.', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/resend-verification-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tooLarge = await page.request.post(
    `${base}/api/auth/send-verification-email`,
    { headers: { Origin: base }, data: { email, padding: 'x'.repeat(16001) } },
  );
  assert.equal(tooLarge.status(), 413);
  await page.goto(renewedVerificationLink);
  await page.waitForURL('**/en/dashboard');
  console.log(
    'Signup, unverified-login rejection, resent verification, bounded auth requests and signed-in dashboard passed.',
  );
  await exerciseProfile(page, pool, base);
  await exerciseAccountExports(page, pool, base);
  await page.goto(`${base}/en/competitions/cairo-demo/join`);
  await page.getByLabel('Squad name', { exact: true }).fill('QA First XI');
  const { rows: market } = await pool.query(
    "SELECT p.data AS pool, f.data AS footballer FROM fantasy.competition_players p JOIN fantasy.footballers f ON f.id=p.footballer_id JOIN fantasy.competitions c ON c.id=p.competition_id WHERE c.slug='cairo-demo'",
  );
  const selected = [];
  const clubs = new Map();
  for (const [position, count] of Object.entries({
    GK: 2,
    DEF: 5,
    MID: 5,
    FWD: 3,
  })) {
    for (let i = 0; i < count; i++) {
      const player = market
        .filter(
          (p) =>
            p.pool.position === position &&
            !selected.includes(p) &&
            (clubs.get(p.footballer.clubId) ?? 0) < 3,
        )
        .sort(
          (a, b) =>
            (clubs.get(a.footballer.clubId) ?? 0) -
            (clubs.get(b.footballer.clubId) ?? 0),
        )[0];
      assert.ok(player);
      selected.push(player);
      clubs.set(
        player.footballer.clubId,
        (clubs.get(player.footballer.clubId) ?? 0) + 1,
      );
      await page
        .getByRole('button', {
          name: `Add ${player.footballer.name.en}`,
          exact: true,
        })
        .click();
    }
  }
  await page.getByRole('button', { name: 'Arrange an initial lineup' }).click();
  await page.getByRole('button', { name: 'REVIEW CHANGES' }).click();
  await expect(
    page.getByRole('heading', { name: 'CONFIRM YOUR CALL.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'CONFIRM & SAVE' }).click();
  await page.waitForURL(/\/en\/entries\/[\da-f-]+$/u);
  const sessionResponse = await page.request.get(
    `${base}/api/auth/get-session`,
  );
  const session = await sessionResponse.json();
  const saved = await pool.query(
    'SELECT account_id FROM fantasy.entries WHERE id=$1',
    [new URL(page.url()).pathname.split('/').at(-1)],
  );
  assert.equal(
    saved.rows[0]?.account_id,
    session.user.id,
    'Saved squad must belong to the browser session',
  );
  await expect(
    page.getByRole('heading', { name: 'QA First XI' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Bench Boost 1 available' }).click();
  await page.getByRole('button', { name: 'CONFIRM & SAVE' }).click();
  await expect(
    page.getByRole('button', { name: 'Bench Boost Cancel — review impact' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Bench Boost Cancel — review impact' })
    .click();
  await page.getByRole('button', { name: 'CONFIRM & SAVE' }).click();
  await expect(
    page.getByRole('button', { name: 'Bench Boost 1 available' }),
  ).toBeVisible();
  console.log(
    'Squad construction, database save, chip activation and cancellation passed.',
  );
  await exerciseGroups(page, pool, base, session.user.id);
  await page.screenshot({ path: 'artifacts/web/squad-en.png', fullPage: true });
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'artifacts/web/squad-en-mobile-light.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(`${base}/en`);
  await page.goto(`${base}/en/forgot-password`);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(
    'If the address is registered',
  );
  await page.goto(await mailLink('Reset password'));
  const replacement = `Qa-${randomBytes(18).toString('hex')}`;
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await page.goto(`${base}/en/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await signInWithinLimit();
  await page.waitForURL('**/en/dashboard');
  assert.deepEqual(errors, []);
  assertHealthy();
  console.log(
    'Persistent light mode, mobile overflow check, sign-out, password reset and new-password sign-in passed.',
  );
  await page.goto(`${base}/en/security`);
  await page.getByLabel('Current password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const keyField = page.getByLabel('Manual setup key');
  await expect(keyField).toBeVisible();
  const setup = await keyField.inputValue();
  const recoveryCode = await page
    .locator('.recovery-codes code')
    .first()
    .textContent();
  assert.ok(recoveryCode);
  const totp = new TOTP({
    secret: Secret.fromBase32(setup),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  await page.getByLabel('I saved my recovery codes securely.').check();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(totp.generate());
  await page.getByRole('button', { name: 'Verify and enable' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Two-factor authentication is enabled.',
    }),
  ).toBeVisible();
  const verifiedSession = await (
    await page.request.get(`${base}/api/auth/get-session`)
  ).json();
  // Only this run's disposable local QA account receives this test grant.
  await pool.query(
    "INSERT INTO fantasy.staff_grants(id,account_id,role,competition_id,granted_by) VALUES($1,$2,'owner',NULL,'local-browser-test')",
    [randomUUID(), verifiedSession.user.id],
  );
  await page.goto(`${base}/en/admin`);
  await page.waitForURL('**/en/security');
  const beforeProof = await pool.query(
    'SELECT session_id FROM fantasy.staff_session_proofs WHERE account_id=$1',
    [verifiedSession.user.id],
  );
  assert.equal(beforeProof.rows.length, 0);
  await page.getByLabel('Current password', { exact: true }).fill(replacement);
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(totp.generate());
  await page.getByRole('button', { name: 'Unlock administration' }).click();
  await page.waitForURL('**/en/admin');
  await expect(
    page.getByRole('heading', { name: 'YOU RUN THE GAME.' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'artifacts/web/admin-en-light.png',
    fullPage: true,
  });
  const proof = await pool.query(
    'SELECT session_id FROM fantasy.staff_session_proofs WHERE account_id=$1',
    [verifiedSession.user.id],
  );
  assert.equal(proof.rows[0]?.session_id, verifiedSession.session.id);
  await exerciseAdminLayout(page, base);
  await exerciseStaff(page, pool, base);
  await exerciseProviders(page, pool, base);
  await exerciseProviderNormalization(page, pool, base);
  await exerciseWorkerHealth(page, pool, base);
  await exercisePriceCalibration(page, pool, base);
  await exerciseCatalogueImport(page, pool, base);
  await exerciseCatalogue(page, pool, base, cleanupSeasons);
  await exerciseCompetitionSetup(page, pool, base, competitionSlug);
  const achievementCompetitionId = await createBrowserAchievement(
    page,
    pool,
    base,
    competitionSlug,
  );
  const prizeId = await createBrowserPrize(page, pool, base, competitionSlug);
  await exerciseRoundResults(
    page,
    pool,
    base,
    competitionSlug,
    cleanupFixtures,
  );
  await exerciseSupport(page, pool, base, achievementCompetitionId);
  await exerciseSponsors(
    page,
    pool,
    base,
    achievementCompetitionId,
    competitionSlug,
  );
  await verifyBrowserAchievement(page, pool, base, achievementCompetitionId);
  await verifyPrizeSelfAwardHold(page, pool, base, prizeId);
  await exercisePrizeCorrections(
    page,
    pool,
    base,
    prizeId,
    verifiedSession.user.id,
  );
  await exerciseChipGrants(page, pool, base, competitionSlug);
  await exerciseEntryLifecycle(
    page,
    pool,
    base,
    achievementCompetitionId,
    verifiedSession.user.id,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(`${base}/en`);
  await page.goto(`${base}/en/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await signInWithinLimit();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(totp.generate());
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await page.waitForURL('**/en/dashboard');
  await page.goto(`${base}/en/admin`);
  await page.waitForURL('**/en/security');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(`${base}/en`);
  await page.goto(`${base}/en/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await signInWithinLimit();
  await page
    .getByRole('button', { name: 'Use a recovery code', exact: true })
    .click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await page.waitForURL('**/en/dashboard');
  await page.goto(`${base}/en/security`);
  await page
    .getByText('Replace or disable authenticator', { exact: true })
    .click();
  await page.getByLabel('Password to confirm disabling').fill(replacement);
  await page
    .getByLabel(
      'I understand that current authenticator protection will be removed.',
    )
    .check();
  await page
    .getByRole('button', { name: 'Disable current authenticator', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Set up authenticator', exact: true }),
  ).toBeVisible();
  await page.goto(`${base}/en/admin`);
  await page.waitForURL('**/en/security');
  assert.deepEqual(errors, []);
  assertHealthy();
  console.log(
    'Authenticator enrollment, staff session verification, MFA sign-in and rejection of an old session proof passed.',
  );
} catch (error) {
  console.error('Browser failed at path:', new URL(page.url()).pathname);
  if (!page.isClosed()) {
    await page
      .screenshot({
        path: 'artifacts/web/browser-failure.png',
        fullPage: true,
        timeout: 10_000,
        mask: [page.locator('input, textarea, code, .recovery-codes')],
      })
      .catch(() => undefined);
    console.error(
      'Visible headings:',
      await page
        .getByRole('heading')
        .allTextContents()
        .catch(() => []),
    );
  }
  throw error;
} finally {
  await browser.close();
  // Remove only this run's local QA account and its test entries. No operator data is touched.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const seasonId of cleanupSeasons) {
      await client.query('DELETE FROM fantasy.footballers WHERE season_id=$1', [
        seasonId,
      ]);
      await client.query('DELETE FROM fantasy.clubs WHERE season_id=$1', [
        seasonId,
      ]);
      await client.query('DELETE FROM fantasy.seasons WHERE id=$1', [seasonId]);
    }
    const competitions = await client.query(
      'SELECT id FROM fantasy.competitions WHERE slug=$1',
      [competitionSlug],
    );
    const competitionId = competitions.rows[0]?.id;
    if (competitionId) {
      await client.query(
        'DELETE FROM fantasy.prize_correction_observations WHERE case_id IN (SELECT id FROM fantasy.prize_correction_cases WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.prize_correction_cases WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.entry_retirements WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.sponsor_daily_metrics WHERE campaign_id IN (SELECT id FROM fantasy.sponsor_campaigns WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.sponsor_campaigns WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.sponsor_assets WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.achievement_grants WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.achievement_definitions WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.audit_events WHERE scope_id IN (SELECT id::text FROM fantasy.prize_pools WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.prize_proposals WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.prize_eligibility WHERE pool_id IN (SELECT id FROM fantasy.prize_pools WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.prize_pools WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.chip_grant_receipts WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.chip_grants WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.price_batch_sources WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.price_batches WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.audit_events WHERE scope_id=$1 OR scope_id IN (SELECT id::text FROM fantasy.gameweeks WHERE competition_id=$1::uuid)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.entry_results WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.entry_snapshot_repairs WHERE gameweek_id IN (SELECT id FROM fantasy.gameweeks WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.entry_snapshots WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.entries WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.result_reviews WHERE gameweek_id IN (SELECT id FROM fantasy.gameweeks WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.round_calculations WHERE gameweek_id IN (SELECT id FROM fantasy.gameweeks WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.gameweek_player_pools WHERE gameweek_id IN (SELECT id FROM fantasy.gameweeks WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.fixture_assignments WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.empty_round_settlements WHERE gameweek_id IN (SELECT id FROM fantasy.gameweeks WHERE competition_id=$1)',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.gameweeks WHERE competition_id=$1',
        [competitionId],
      );
      await client.query(
        'DELETE FROM fantasy.competition_players WHERE competition_id=$1',
        [competitionId],
      );
      await client.query('DELETE FROM fantasy.competitions WHERE id=$1', [
        competitionId,
      ]);
    }
    for (const fixtureId of cleanupFixtures) {
      await client.query(
        'DELETE FROM fantasy.fixture_dispositions WHERE fixture_id=$1',
        [fixtureId],
      );
      await client.query('DELETE FROM fantasy.audit_events WHERE scope_id=$1', [
        fixtureId,
      ]);
      await client.query(
        'DELETE FROM fantasy.fact_revisions WHERE fixture_id=$1',
        [fixtureId],
      );
      await client.query(
        'DELETE FROM fantasy.fixture_observations WHERE fixture_id=$1',
        [fixtureId],
      );
      await client.query(
        'DELETE FROM fantasy.provider_evidence WHERE resource=$1',
        [`fixture:${fixtureId}`],
      );
      await client.query('DELETE FROM fantasy.fixtures WHERE id=$1', [
        fixtureId,
      ]);
    }
    const result = await client.query('SELECT id FROM "user" WHERE email=$1', [
      email,
    ]);
    const accountId = result.rows[0]?.id;
    if (accountId) {
      for (const table of [
        'chat_moderation_events',
        'chat_reports',
        'chat_timeouts',
        'chat_preferences',
        'chat_messages',
        'chat_settings',
      ]) {
        await client.query(
          `DELETE FROM fantasy.${table} WHERE group_id IN (SELECT id FROM fantasy.league_groups WHERE organizer_id=$1)`,
          [accountId],
        );
      }
      await client.query(
        'DELETE FROM fantasy.chat_blocks WHERE account_id=$1 OR blocked_id=$1',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.chat_post_events WHERE account_id=$1',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.h2h_forfeits WHERE edition_id IN (SELECT e.id FROM fantasy.h2h_editions e JOIN fantasy.league_groups g ON g.id=e.group_id WHERE g.organizer_id=$1)',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.h2h_registrations WHERE edition_id IN (SELECT e.id FROM fantasy.h2h_editions e JOIN fantasy.league_groups g ON g.id=e.group_id WHERE g.organizer_id=$1)',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.h2h_editions WHERE group_id IN (SELECT id FROM fantasy.league_groups WHERE organizer_id=$1)',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.group_membership_history WHERE group_id IN (SELECT id FROM fantasy.league_groups WHERE organizer_id=$1)',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.group_memberships WHERE group_id IN (SELECT id FROM fantasy.league_groups WHERE organizer_id=$1)',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.league_groups WHERE organizer_id=$1',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.staff_session_proofs WHERE account_id=$1',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.staff_verification_limits WHERE account_id=$1',
        [accountId],
      );
      await client.query(
        'DELETE FROM fantasy.staff_grants WHERE account_id=$1',
        [accountId],
      );
      await client.query('DELETE FROM fantasy.audit_events WHERE actor_id=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM fantasy.commands WHERE actor_id=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM fantasy.entries WHERE account_id=$1', [
        accountId,
      ]);
      await client.query(
        'DELETE FROM fantasy.account_exports WHERE account_id=$1',
        [accountId],
      );
      await client.query('DELETE FROM fantasy.accounts WHERE id=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM "session" WHERE "userId"=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM "account" WHERE "userId"=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM "twoFactor" WHERE "userId"=$1', [
        accountId,
      ]);
      await client.query('DELETE FROM "user" WHERE id=$1', [accountId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    for (const file of await readdir(process.env.MAIL_OUTBOX_DIR)) {
      const path = `${process.env.MAIL_OUTBOX_DIR}/${file}`;
      const mail = JSON.parse(await readFile(path, 'utf8'));
      if (mail.to === email) await unlink(path);
    }
  }
}
