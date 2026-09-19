import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Anonymous acceptance against the persistent synthetic replay; no provider requests. */
export async function exerciseHomeBoard(page, pool, base) {
  const viewport = page.viewportSize();
  const competition = (
    await pool.query(
      "SELECT id FROM fantasy.competitions WHERE slug='cairo-replay'",
    )
  ).rows[0];
  assert.ok(competition);
  try {
    for (const locale of ['en', 'ar']) {
      for (const theme of ['dark', 'light']) {
        await page
          .context()
          .addCookies([{ name: 'fantasy-theme', value: theme, url: base }]);
        await page.setViewportSize(
          locale === 'ar'
            ? { width: 390, height: 844 }
            : { width: 1440, height: 1000 },
        );
        await page.goto(`${base}/${locale}?competition=cairo-replay`);
        const board = page.locator('#scoreboard');
        await expect(board).toBeVisible();
        await expect(board.locator('.winning-pitch .kit-player')).toHaveCount(
          11,
        );
        await expect(board.locator('.winning-bench .kit-player')).toHaveCount(
          4,
        );
        await expect(board.locator('.captain-badge')).toHaveCount(1);
        const leaders = board.locator('.leaderboard-list > li');
        assert.ok((await leaders.count()) > 0 && (await leaders.count()) <= 5);
        await expect(leaders.first().locator('.rank-movement')).toBeVisible();
        await expect(board.locator('.synthetic-banner')).toContainText(
          locale === 'ar' ? 'بيانات تجريبية' : 'SYNTHETIC',
        );
        const help = board.getByRole('button', {
          name:
            locale === 'ar'
              ? 'شرح: التشكيلة والنقاط'
              : 'Explain: Formation and points',
          exact: true,
        });
        // The reusable help control exposes a localized accessible name.
        await help.click();
        await expect(page.getByRole('tooltip')).toContainText(
          locale === 'ar' ? 'أرقام القمصان' : 'Shirt numbers',
        );
        await page.mouse.move(0, 0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await board.screenshot({
          path: `artifacts/web/home-board-${locale}-${theme}.png`,
        });
      }
    }
    await page.setViewportSize(viewport);
    await page.goto(`${base}/en?competition=cairo-replay`);
    const board = page.locator('#scoreboard');
    const firstLink = board.locator('.leaderboard-list > li a').first();
    const id = (await firstLink.getAttribute('href')).split('/').at(-1);
    const original = (
      await pool.query(
        'SELECT data FROM fantasy.entries WHERE id=$1 AND competition_id=$2',
        [id, competition.id],
      )
    ).rows[0]?.data;
    assert.ok(original);
    const updatedName = 'Home refresh acceptance';
    await pool.query(
      "UPDATE fantasy.entries SET data=jsonb_set(data,'{name}',to_jsonb($2::text)) WHERE id=$1",
      [id, updatedName],
    );
    try {
      await board
        .getByRole('button', { name: 'Refresh now', exact: true })
        .click();
      await expect(
        board
          .locator('.leaderboard-list')
          .getByRole('link', { name: updatedName, exact: true }),
      ).toBeVisible();
    } finally {
      await pool.query(
        'UPDATE fantasy.entries SET data=$2::jsonb WHERE id=$1',
        [id, JSON.stringify(original)],
      );
    }
    await board.getByRole('link', { name: 'FULL STANDINGS' }).click();
    await expect(
      page.getByRole('columnheader', { name: 'Movement', exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/en?competition=cairo-replay`);
    await board.getByRole('link', { name: 'FULL GAMEWEEK RESULTS' }).click();
    await expect(page).toHaveURL(/\/standings\?gameweek=/u);
    await expect(
      page.getByRole('columnheader', { name: 'Movement', exact: true }),
    ).toHaveCount(0);
    await page.locator('.results-table tbody a').first().click();
    await expect(page).toHaveURL(/\/results\/[^?]+\?gameweek=/u);
    await expect(page.locator('.winning-pitch .kit-player')).toHaveCount(11);
    await page.goto(`${base}/en?competition=cairo-demo`);
    await expect(board.locator('.winning-pitch')).toHaveCount(0);
    await expect(board).toContainText(
      'The first winners appear once a gameweek is final.',
    );
    console.log(
      'Home board: bilingual themed pitch, short/full standings, round links, rank movement, anonymous refresh and empty state passed.',
    );
  } finally {
    await page.setViewportSize(viewport);
    await page
      .context()
      .addCookies([{ name: 'fantasy-theme', value: 'dark', url: base }]);
  }
}
