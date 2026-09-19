import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { monitorPageHealth } from './browser-health.mjs';

export async function exerciseHelpGuides(page, pool, base, slug) {
  const original = page.url();
  const competition = (
    await pool.query('SELECT data FROM fantasy.competitions WHERE slug=$1', [
      slug,
    ])
  ).rows[0].data;
  const old = (
    await pool.query(
      'SELECT data FROM fantasy.gameweeks WHERE competition_id=$1 ORDER BY number LIMIT 1',
      [competition.id],
    )
  ).rows[0].data;
  const futureId = randomUUID();
  const guest = await page
    .context()
    .browser()
    .newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const assertGuestHealthy = monitorPageHealth(guest, base);
  try {
    // Values below were saved through the actual admin form earlier in this workflow.
    await page.goto(
      `${base}/en/playbook?competition=${slug}&gameweek=${old.id}`,
    );
    const assist = page.getByRole('row').filter({
      has: page.getByRole('rowheader', { name: 'Assist', exact: true }),
    });
    await expect(assist.getByRole('cell')).toHaveText('4');
    await expect(
      page.locator('.guide-card').filter({
        has: page.getByRole('heading', {
          name: 'Entries per account in this competition',
          exact: true,
        }),
      }),
    ).toContainText('2');
    await page
      .locator('.site-controls')
      .getByRole('link', { name: 'عربي', exact: true })
      .click();
    await expect(page).toHaveURL(
      `${base}/ar/playbook?competition=${slug}&gameweek=${old.id}`,
    );
    await expect(
      page
        .getByRole('row')
        .filter({
          has: page.getByRole('rowheader', {
            name: 'تمريرة حاسمة',
            exact: true,
          }),
        })
        .getByRole('cell'),
    ).toHaveText((4).toLocaleString('ar'));
    // Rehearse different saved round versions in this disposable competition only.
    await pool.query('UPDATE fantasy.gameweeks SET data=$2 WHERE id=$1', [
      old.id,
      { ...old, status: 'locked' },
    ]);
    const future = {
      ...old,
      id: futureId,
      number: 2,
      name: { en: 'Guide future round', ar: 'جولة الدليل القادمة' },
      deadline: new Date(Date.now() + 14 * 86400_000).toISOString(),
      rules: {
        ...old.rules,
        version: old.rules.version + 1,
        scoring: { ...old.rules.scoring, assist: 6000 },
      },
    };
    await pool.query(
      'INSERT INTO fantasy.gameweeks(id,competition_id,number,deadline,data) VALUES($1,$2,$3,$4,$5)',
      [futureId, competition.id, 2, future.deadline, future],
    );
    await page.goto(`${base}/en/playbook?competition=${slug}`);
    await expect(
      page.getByLabel('Gameweek rules', { exact: true }),
    ).toHaveValue(futureId);
    await expect(assist.getByRole('cell')).toHaveText('6');
    await page
      .getByLabel('Gameweek rules', { exact: true })
      .selectOption(old.id);
    await page.getByRole('button', { name: 'SHOW RULES', exact: true }).click();
    await expect(assist.getByRole('cell')).toHaveText('4');
    assert.equal(new URL(page.url()).searchParams.get('competition'), slug);
    await page.screenshot({
      path: 'artifacts/web/playbook-en.png',
      fullPage: true,
    });
    await guest.goto(
      `${base}/ar/how-to-play?competition=${slug}&gameweek=${futureId}`,
    );
    await expect(
      guest.getByRole('heading', { level: 1, name: 'إزاي تلعب', exact: true }),
    ).toBeVisible();
    const tip = guest.getByRole('button', {
      name: 'شرح: الفريق والتشكيلة',
      exact: true,
    });
    await tip.tap();
    await expect(guest.getByRole('tooltip')).toContainText(
      'التعديلات غير المحفوظة',
    );
    const box = await guest.getByRole('tooltip').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 391);
    await guest.screenshot({ path: 'artifacts/web/how-to-play-ar-help.png' });
    await guest.getByRole('heading', { level: 1 }).tap();
    await expect(guest.getByRole('tooltip')).toHaveCount(0);
    assert.equal(
      await guest.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await guest.goto(`${base}/ar/admin/how-to`);
    await expect(guest).toHaveURL(/\/ar\/login/u);
    const bad = await guest.goto(
      `${base}/en/playbook?competition=${slug}&gameweek=${randomUUID()}`,
    );
    assert.equal(
      bad.status(),
      404,
      'An invalid round must not silently show another version',
    );
    const hidden = await guest.goto(
      `${base}/en/playbook?competition=unknown-private-guide`,
    );
    assert.equal(hidden.status(), 404);
    assertGuestHealthy();
    await page.goto(`${base}/en/admin`);
    await page
      .getByRole('link', {
        name: 'Start with the admin handbook ↗',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'ADMIN HANDBOOK',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Your saved competition settings',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/web/admin-handbook-en.png',
      fullPage: true,
    });
    await page.goto(`${base}/ar/admin/how-to`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'دليل الإدارة',
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/admin-handbook-ar-mobile.png',
    });
    await page.goto(`${base}/en/admin/competitions/${competition.id}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText('Footballer scoring', { exact: true }).click();
    const ruleTip = page.getByRole('button', {
      name: 'Explain: Assist',
      exact: true,
    });
    await ruleTip.focus();
    await expect(page.getByRole('tooltip')).toContainText(
      'Value in this form: 4',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByLabel('Assist', { exact: true }).fill('7');
    await ruleTip.focus();
    await expect(page.getByRole('tooltip')).toContainText(
      'Value in this form: 7',
    );
    await page.keyboard.press('Escape');
    console.log(
      'Bilingual guides passed: saved admin values, future/historical versions, language context, draft field help, touch/keyboard tooltips and protected admin handbook.',
    );
  } finally {
    await guest.close();
    await pool.query('DELETE FROM fantasy.gameweeks WHERE id=$1', [futureId]);
    await pool.query('UPDATE fantasy.gameweeks SET data=$2 WHERE id=$1', [
      old.id,
      old,
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(original);
  }
}
