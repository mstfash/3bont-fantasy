'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  AUTOMATIC_PROVIDER_ADAPTER,
  providerAcceptanceCommandSchema,
  type ProviderAcceptanceCommand,
  type ProviderAcceptancePolicy,
  type ProviderAccount,
} from '@fantasy/contracts';
import { InfoTip } from '@/components/help/info-tip';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
export function ProviderAcceptanceControls({
  locale,
  bindingId,
  policy,
  accounts,
}: {
  readonly locale: Locale;
  readonly bindingId: string;
  readonly policy: ProviderAcceptancePolicy | null;
  readonly accounts: readonly ProviderAccount[];
}) {
  const ar = locale === 'ar';
  const [enabled, setEnabled] = useState(policy?.enabled ?? false),
    [pending, setPending] = useState<ProviderAcceptanceCommand | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = providerAcceptanceCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      bindingId,
      accountId: form.get('accountId'),
      expectedRevision: policy?.revision ?? 0,
      enabled,
      adapterVersion: AUTOMATIC_PROVIDER_ADAPTER,
      maximumSourceAgeMinutes: Number(form.get('age')),
      eligibilityEvidenceReference: form.get('evidence'),
      reason: form.get('reason'),
      completeEligibilityConfirmed: form.get('eligibility') === 'on',
    });
    if (!parsed.success) {
      setNotice(commandError('invalid-request', locale));
      return;
    }
    setNotice('');
    setPending(parsed.data);
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/providers/acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body: unknown = await response.json();
      setNotice(
        commandError(z.object({ code: z.string() }).parse(body).code, locale),
      );
    } catch {
      setNotice(commandError('request-unconfirmed', locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="admin-form"
        onSubmit={review}
        onChange={() => {
          setPending(null);
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {ar ? 'حساب المزود' : 'Provider account'}
            <select
              aria-label={ar ? 'حساب المزود' : 'Provider account'}
              name="accountId"
              defaultValue={policy?.accountId ?? accounts[0]?.id}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  API-FOOTBALL · {a.id.slice(0, 8)} ·{' '}
                  {a.state === 'enabled'
                    ? ar
                      ? 'مفعّل'
                      : 'enabled'
                    : ar
                      ? 'متوقف'
                      : 'paused'}
                </option>
              ))}
            </select>
          </label>
          <label className="confirmation-check">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
              }}
            />
            {ar
              ? 'قبول التقارير المكتملة تلقائياً'
              : 'Automatically accept complete reports'}
          </label>
          <InfoTip
            locale={locale}
            label={
              ar ? 'حدود القبول التلقائي' : 'Automatic acceptance boundaries'
            }
            text={
              ar
                ? 'يدعم حالياً المباريات المنتهية في الوقت الأصلي فقط. لا يملأ الدقائق أو الإحصاءات المجهولة بأصفار. يلزم أيضاً تشغيل العامل وحساب المزود وجدول الجمع؛ يبقى الإعداد العام معطلاً حتى التحقق من المصادر الحقيقية.'
                : 'Currently supports regular-time finished matches only. Unknown minutes or statistics never become zero. Worker automation, provider account and collection schedule must also be enabled; deployment activation waits for verified real sources.'
            }
          />
          <label>
            {ar ? 'أقصى عمر للمصادر بالدقائق' : 'Maximum source age in minutes'}
            <input
              name="age"
              type="number"
              min={5}
              max={1440}
              required
              defaultValue={policy?.maximumSourceAgeMinutes ?? 120}
            />
          </label>
          <InfoTip
            locale={locale}
            label={ar ? 'حداثة المصادر' : 'Source freshness'}
            text={
              ar
                ? 'يُقاس العمر من أقدم استجابة في الدفعة، وتبقى الفجوة بين المصادر بحد أقصى عشر دقائق. الدفعات الأقدم من آخر تقرير مقبول تُحجب.'
                : 'Age is measured from the oldest response in the batch; the sources must still be within ten minutes of each other. Bundles older than the latest accepted report are held.'
            }
          />
          <label>
            {ar
              ? 'مرجع التحقق من الأهلية والبيانات المرخصة'
              : 'Verified eligibility and licensed data reference'}
            <textarea
              name="evidence"
              required
              minLength={5}
              maxLength={2000}
              defaultValue={policy?.eligibilityEvidenceReference ?? ''}
            />
          </label>
          <label className="confirmation-check">
            <input type="checkbox" name="eligibility" required={enabled} />
            {ar
              ? 'تحققت من اكتمال قوائم المباراة وبيانات المشاركة للموسم المرخص قبل تفعيل هذا الإصدار.'
              : 'I verified complete matchday rosters and participation data for the licensed season before enabling this version.'}
          </label>
          <label>
            {ar ? 'سبب تغيير سياسة القبول' : 'Acceptance policy reason'}
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <button type="submit" className="button-outline">
            {ar ? 'مراجعة سياسة القبول' : 'REVIEW ACCEPTANCE POLICY'}
          </button>
        </fieldset>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && (
        <div className="admin-confirmation">
          <p>
            {pending.enabled
              ? ar
                ? 'سيُسمح بقبول التقارير التي تجتاز جميع الشروط لهذا الموسم.'
                : 'Reports passing every check for this season may be accepted.'
              : ar
                ? 'سيُوقف القبول التلقائي لهذا الموسم.'
                : 'Automatic acceptance for this season will be paused.'}
          </p>
          <p>{pending.eligibilityEvidenceReference}</p>
          <p>
            {ar ? 'حساب المزود' : 'Provider account'}: {pending.accountId}
          </p>
          <p>
            {ar ? 'أقصى عمر للمصادر بالدقائق' : 'Maximum source age in minutes'}
            : {pending.maximumSourceAgeMinutes}
          </p>
          <p>
            {ar ? 'الإصدار الحالي' : 'Current revision'}:{' '}
            {pending.expectedRevision}
          </p>
          <p>{pending.reason}</p>
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد سياسة القبول' : 'CONFIRM ACCEPTANCE POLICY'}
          </button>
        </div>
      )}
    </>
  );
}
