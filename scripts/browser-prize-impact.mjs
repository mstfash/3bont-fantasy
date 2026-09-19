import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** The surrounding result rehearsal has staged a real, persisted assist correction. */
export async function exercisePrizeImpact(page, pool, base, round, entry) {
  const prizes = (
    await pool.query(
      'SELECT data FROM fantasy.prize_pools WHERE competition_id=$1',
      [round.competitionId],
    )
  ).rows.map((r) => r.data);
  const prize = prizes.find(
    (p) => p.state === 'published' && p.gameweekIds.includes(round.id),
  );
  assert.ok(prize);
  for (const locale of ['en', 'ar']) {
    await page.setViewportSize(
      locale === 'ar'
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    );
    await page.goto(`${base}/${locale}/admin/prizes/${prize.id}`);
    await page
      .getByText(locale === 'ar' ? 'اختر الجولة' : 'Choose a gameweek', {
        exact: true,
      })
      .click();
    await page
      .locator(
        `a[href="/${locale}/admin/prizes/${prize.id}/corrections/${round.id}"]`,
      )
      .click();
    const section = page.getByRole('region', {
      name: `${locale === 'ar' ? 'التوزيع المقترح للجوائز' : 'Projected prize allocation'}: ${prize.name[locale]}`,
      exact: true,
    });
    await expect(
      section.getByRole('cell', { name: entry.name, exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole('columnheader', {
        name: locale === 'ar' ? 'الجائزة المقترحة' : 'Projected award',
        exact: true,
      }),
    ).toBeVisible();
    await section
      .getByRole('button', {
        name:
          locale === 'ar'
            ? 'شرح: التوزيع المقترح للجوائز'
            : 'Explain: Projected prize allocation',
        exact: true,
      })
      .click();
    await expect(page.getByRole('tooltip')).toContainText(
      locale === 'ar' ? 'ليس قرار اعتماد' : 'not an approval',
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `artifacts/web/prize-impact-${locale}.png`,
      fullPage: true,
    });
    await page.goto(`${base}/${locale}/admin/results/${round.id}`);
    await expect(
      page
        .getByRole('region', {
          name: `${locale === 'ar' ? 'التوزيع المقترح للجوائز' : 'Projected prize allocation'}: ${prize.name[locale]}`,
          exact: true,
        })
        .getByRole('cell', { name: entry.name, exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/en/admin/results/${round.id}`);
  console.log(
    'Browser prize correction projections passed: scoped prize-page links, English/Arabic awards, localized help and mobile overflow.',
  );
}
