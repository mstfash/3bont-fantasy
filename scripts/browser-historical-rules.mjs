import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function exerciseHistoricalRules(page, pool, base, roundId, slug) {
  const readRound = async () =>
    (
      await pool.query('SELECT data FROM fantasy.gameweeks WHERE id=$1', [
        roundId,
      ])
    ).rows[0].data;
  const before = await readRound();
  const snapshots = (
    await pool.query(
      'SELECT entry_id,payload FROM fantasy.entry_snapshots WHERE gameweek_id=$1 ORDER BY entry_id',
      [roundId],
    )
  ).rows;
  const nextAssist = before.rules.scoring.assist / 1000 + 1;
  await page.goto(`${base}/en/admin/results/${roundId}`);
  await page
    .getByRole('link', {
      name: 'Correct historical gameweek rules ↗',
      exact: true,
    })
    .click();
  await page.getByText('Footballer scoring', { exact: true }).click();
  await page.getByLabel('Assist', { exact: true }).fill(String(nextAssist));
  await page
    .getByRole('button', { name: 'Explain: Assist', exact: true })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText(
    `Value in this form: ${nextAssist}`,
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'PREVIEW RULE CORRECTION', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Historical correction preview',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Rules before and after', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'PREVIEW RULE CORRECTION', exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(
    await readRound(),
    before,
    'GET preview cannot publish rules or scores',
  );
  const reviewUrl = page.url();
  await page.getByRole('link', { name: 'Edit proposal', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Approve rule correction', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Footballer scoring', { exact: true }).click();
  await expect(page.getByLabel('Assist', { exact: true })).toHaveValue(
    String(nextAssist),
  );
  await page
    .getByRole('button', { name: 'PREVIEW RULE CORRECTION', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Historical correction preview',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/web/historical-rules-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewUrl.replace('/en/admin/', '/ar/admin/'));
  await expect(
    page.getByRole('heading', { name: 'معاينة التصحيح التاريخي', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole('button', { name: 'شرح: حدود التصحيح التاريخي', exact: true })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('القواعد المستقبلية');
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: 'artifacts/web/historical-rules-ar-mobile.png',
    fullPage: true,
  });
  await page
    .getByLabel('سبب التصحيح ودليله', { exact: true })
    .fill(
      'Browser proof: correct the published assist rule for this round only',
    );
  await page
    .getByLabel(
      'راجعت القواعد والنقاط والترتيب والمواجهات والجوائز المتأثرة.',
      { exact: true },
    )
    .check();
  await page
    .getByRole('button', { name: 'مراجعة الاعتماد', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد تصحيح القواعد', exact: true })
    .click();
  await page.waitForURL(`${base}/ar/admin/results/${roundId}/rules`);
  const after = await readRound();
  assert.equal(after.resultRevision, before.resultRevision + 1);
  assert.equal(after.rules.scoring.assist, nextAssist * 1000);
  assert.deepEqual(
    (
      await pool.query(
        'SELECT entry_id,payload FROM fantasy.entry_snapshots WHERE gameweek_id=$1 ORDER BY entry_id',
        [roundId],
      )
    ).rows,
    snapshots,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM fantasy.round_calculations WHERE gameweek_id=$1 AND revision IN ($2,$3)',
        [roundId, before.resultRevision, after.resultRevision],
      )
    ).rows[0].n,
    2,
  );
  for (const locale of ['en', 'ar']) {
    await page.goto(
      `${base}/${locale}/playbook?competition=${slug}&gameweek=${roundId}`,
    );
    await expect(
      page
        .getByRole('row')
        .filter({
          has: page.getByRole('rowheader', {
            name: locale === 'ar' ? 'تمريرة حاسمة' : 'Assist',
            exact: true,
          }),
        })
        .getByRole('cell'),
    ).toHaveText(nextAssist.toLocaleString(locale));
  }
  const guest = await page.context().browser().newContext();
  try {
    const response = await guest.request.post(
      `${base}/api/v1/admin/historical-rules`,
      { data: {}, headers: { Origin: base } },
    );
    assert.equal(response.status(), 401);
  } finally {
    await guest.close();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'Historical rules browser proof passed: read-only proposal, isolated edit/review, Arabic confirmation, retained revisions/snapshots and dynamic bilingual playbooks.',
  );
}
