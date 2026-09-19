import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseProviderSchedules(page, pool, base, bindingId) {
  const anonymous = await fetch(`${base}/api/v1/admin/providers/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  assert.equal(anonymous.status, 401);
  await page.goto(`${base}/en/admin/providers/schedules`);
  const season = page.getByRole('region', {
    name: 'QA normalization season',
    exact: true,
  });
  await season.getByLabel('Enable collection for this season').check();
  await season
    .getByLabel('Coverage and usage-rights review reference')
    .fill('Synthetic browser rehearsal; no live provider authorization');
  await season
    .getByLabel('Reason for schedule change')
    .fill('QA review of bounded match-source collection');
  await season
    .getByRole('button', { name: 'REVIEW COLLECTION SCHEDULE', exact: true })
    .click();
  await expect(
    season.getByText(/Each batch needs four requests before retries/u),
  ).toBeVisible();
  await season
    .getByRole('button', { name: 'CONFIRM COLLECTION SCHEDULE', exact: true })
    .click();
  await expect(
    season.getByText('Season schedule enabled · Synthetic data', {
      exact: true,
    }),
  ).toBeVisible();
  const saved = (
    await pool.query(
      'SELECT data FROM fantasy.provider_schedules WHERE binding_id=$1',
      [bindingId],
    )
  ).rows[0].data;
  assert.equal(saved.enabled, true);
  assert.equal(saved.liveIntervalMinutes, 15);
  assert.equal(saved.correctionHours, 72);
  await season.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/web/provider-schedules-en.png' });
  await page.goto(`${base}/ar/admin/providers/schedules`);
  await page.setViewportSize({ width: 390, height: 844 });
  const arabic = page.getByRole('region', {
    name: 'اختبار مصادر المباراة',
    exact: true,
  });
  await expect(arabic.getByLabel('تفعيل الجمع لهذا الموسم')).toBeChecked();
  await arabic.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/provider-schedules-ar-mobile.png',
  });
  await arabic.getByLabel('تفعيل الجمع لهذا الموسم').uncheck();
  await arabic
    .getByLabel('سبب تغيير الجدول')
    .fill('إيقاف جدول الاختبار بعد مراجعة الإعدادات');
  await arabic
    .getByRole('button', { name: 'مراجعة جدول الجمع', exact: true })
    .click();
  await arabic
    .getByRole('button', { name: 'تأكيد جدول الجمع', exact: true })
    .click();
  await expect(
    arabic.getByText('جدول الموسم متوقف · بيانات اختبار', { exact: true }),
  ).toBeVisible();
  await expect(arabic.getByLabel('تفعيل الجمع لهذا الموسم')).not.toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'Provider schedule controls: reviewed enable/pause, persisted limits and Arabic mobile passed without live requests.',
  );
}
