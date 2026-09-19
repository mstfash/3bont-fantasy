import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseProviderAcceptance(page, pool, base, bindingId) {
  const anonymous = await fetch(`${base}/api/v1/admin/providers/acceptance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  assert.equal(anonymous.status, 401);
  await page.goto(`${base}/en/admin/providers/acceptance`);
  const season = page.getByRole('region', {
    name: 'QA normalization season',
    exact: true,
  });
  const enabled = season.getByLabel('Automatically accept complete reports', {
    exact: true,
  });
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await season.getByLabel('Maximum source age in minutes').fill('90');
  await season
    .getByLabel('Verified eligibility and licensed data reference')
    .fill('Synthetic browser coverage; no real provider activation');
  await season
    .getByLabel('Acceptance policy reason')
    .fill('QA rehearsal of explicit season acceptance');
  const confirmation = season.getByLabel(
    'I verified complete matchday rosters and participation data for the licensed season before enabling this version.',
    { exact: true },
  );
  await expect(confirmation).toHaveAttribute('required', '');
  await confirmation.check();
  await season
    .getByRole('button', { name: 'REVIEW ACCEPTANCE POLICY', exact: true })
    .click();
  await expect(
    season.getByText(
      'Reports passing every check for this season may be accepted.',
    ),
  ).toBeVisible();
  await season
    .getByRole('button', { name: 'CONFIRM ACCEPTANCE POLICY', exact: true })
    .click();
  await expect(
    season.getByText('Acceptance policy enabled · Revision 1', { exact: true }),
  ).toBeVisible();
  const saved = (
    await pool.query(
      'SELECT data FROM fantasy.provider_acceptance_policies WHERE binding_id=$1',
      [bindingId],
    )
  ).rows[0].data;
  assert.equal(saved.maximumSourceAgeMinutes, 90);
  assert.equal(saved.enabled, true);
  await season.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/web/provider-acceptance-en.png' });
  await page.goto(`${base}/ar/admin/providers/acceptance`);
  await page.setViewportSize({ width: 390, height: 844 });
  const arabic = page.getByRole('region', {
    name: 'اختبار مصادر المباراة',
    exact: true,
  });
  await expect(
    arabic.getByLabel('قبول التقارير المكتملة تلقائياً'),
  ).toBeChecked();
  await expect(arabic.getByLabel('أقصى عمر للمصادر بالدقائق')).toHaveValue(
    '90',
  );
  await arabic.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/provider-acceptance-ar-mobile.png',
  });
  await arabic.getByLabel('قبول التقارير المكتملة تلقائياً').uncheck();
  await arabic
    .getByLabel('سبب تغيير سياسة القبول')
    .fill('إيقاف سياسة الاختبار بعد مراجعة القبول');
  await arabic
    .getByRole('button', { name: 'مراجعة سياسة القبول', exact: true })
    .click();
  await arabic
    .getByRole('button', { name: 'تأكيد سياسة القبول', exact: true })
    .click();
  await expect(
    arabic.getByText('القبول التلقائي متوقف · الإصدار 2', { exact: true }),
  ).toBeVisible();
  await expect(
    arabic.getByLabel('قبول التقارير المكتملة تلقائياً'),
  ).not.toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'Provider acceptance: owner policy review, persisted limits, Arabic mobile pause and anonymous denial passed without live requests.',
  );
}
