'use client';
import { useRouter } from 'next/navigation';
import {
  providerCommandSchema,
  providerCommandResultSchema,
  type ProviderAccount,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { CairoDateTime } from '../cairo-date-time';
import { formText } from '../groups/reviewed-form';
export function ProviderControls({
  locale,
  account,
  windowStart,
  used,
}: {
  readonly locale: Locale;
  readonly account: ProviderAccount | null;
  readonly windowStart: string | null;
  readonly used: number;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    shared = {
      locale,
      endpoint: '/api/v1/admin/providers',
      commandSchema: providerCommandSchema,
      resultSchema: providerCommandResultSchema,
      onSaved: () => {
        router.refresh();
      },
    };
  return (
    <div className="group-grid">
      <section className="group-card">
        <h2>{ar ? 'حدود مؤكّدة' : 'CONFIRMED LIMITS'}</h2>
        <ReviewedCommandForm
          {...shared}
          label={ar ? 'مراجعة إعدادات المزود' : 'Review provider settings'}
          makeCommand={(form) => ({
            kind: 'configure',
            commandId: crypto.randomUUID(),
            expectedRevision: account?.revision ?? 0,
            dailyLimit: Number(formText(form, 'daily')),
            minuteLimit: Number(formText(form, 'minute')),
            resetAnchor: formText(form, 'anchor'),
            dedicatedKeyConfirmed: form.get('dedicated') === 'on',
            reason: formText(form, 'reason'),
            evidenceReference: formText(form, 'evidence'),
          })}
        >
          <p>
            {ar
              ? 'أدخل الحدود وموعد إعادة التعيين بعد التحقق من حساب المزود. حفظ الإعدادات يوقف الطلبات حتى مراجعة الاستهلاك. لا تضع مفتاح الخدمة في هذه الصفحة.'
              : 'Enter limits and the reset instant verified for the provider account. Saving pauses requests until usage is reconciled. Do not enter the API key on this page.'}
          </p>
          <label>
            {ar ? 'حد الطلبات اليومي' : 'Daily request limit'}
            <input
              name="daily"
              type="number"
              min={1}
              max={1500000}
              defaultValue={account?.dailyLimit ?? ''}
              required
            />
          </label>
          <label>
            {ar ? 'حد الطلبات في الدقيقة' : 'Requests per minute'}
            <input
              name="minute"
              type="number"
              min={1}
              max={10000}
              defaultValue={account?.minuteLimit ?? ''}
              required
            />
          </label>
          <CairoDateTime
            locale={locale}
            name="anchor"
            label={
              ar ? 'آخر موعد إعادة تعيين مؤكّد' : 'Last confirmed reset instant'
            }
            initialValue={account?.resetAnchor ?? ''}
          />
          <label className="confirmation-check">
            <input name="dedicated" type="checkbox" required />
            {ar
              ? 'هذا المفتاح مخصّص لهذا التشغيل ولا تستخدمه تطبيقات أخرى.'
              : 'This key is dedicated to this deployment and is not shared with other apps.'}
          </label>
          <label>
            {ar
              ? 'مرجع إثبات الحدود وموعد التعيين'
              : 'Limit and reset evidence reference'}
            <input name="evidence" minLength={5} maxLength={1000} required />
          </label>
          <label>
            {ar ? 'سبب تعديل الإعدادات' : 'Settings change reason'}
            <textarea name="reason" minLength={5} maxLength={1000} required />
          </label>
        </ReviewedCommandForm>
      </section>
      {account && windowStart && (
        <section className="group-card">
          <h2>{ar ? 'مطابقة الاستهلاك' : 'RECONCILE USAGE'}</h2>
          <ReviewedCommandForm
            {...shared}
            label={ar ? 'مراجعة تفعيل الطلبات' : 'Review enabling requests'}
            makeCommand={(form) => ({
              kind: 'reconcile',
              commandId: crypto.randomUUID(),
              expectedRevision: account.revision,
              windowStart,
              usedToday: Number(formText(form, 'used')),
              reason: formText(form, 'reason'),
              evidenceReference: formText(form, 'evidence'),
            })}
          >
            <p>
              {ar
                ? 'راجع لوحة المزود وأدخل الاستهلاك الإجمالي لهذه الفترة. لا يمكن تقليل الاستهلاك المسجّل. بعد التفعيل تبقى مهلة أمان ٦٥ ثانية على الأقل قبل أي طلب.'
                : 'Check the provider dashboard and enter total usage for this window. Recorded consumption cannot decrease. Enabling retains a safety wait of at least 65 seconds before a request.'}
            </p>
            <label>
              {ar ? 'إجمالي الطلبات المستخدمة' : 'Total requests already used'}
              <input
                name="used"
                type="number"
                min={used}
                max={1500000}
                defaultValue={used}
                required
              />
            </label>
            <label>
              {ar ? 'مرجع مراجعة الاستهلاك' : 'Usage evidence reference'}
              <input name="evidence" minLength={5} maxLength={1000} required />
            </label>
            <label>
              {ar ? 'سبب المطابقة' : 'Reconciliation reason'}
              <textarea name="reason" minLength={5} maxLength={1000} required />
            </label>
            <label className="confirmation-check">
              <input type="checkbox" required />
              {ar
                ? 'راجعت الفترة الحالية والاستهلاك الفعلي في لوحة المزود.'
                : 'I checked this window and actual usage in the provider dashboard.'}
            </label>
          </ReviewedCommandForm>
        </section>
      )}
      {account && (
        <section className="group-card">
          <h2>{ar ? 'إيقاف الطلبات' : 'PAUSE REQUESTS'}</h2>
          <ReviewedCommandForm
            {...shared}
            label={ar ? 'مراجعة إيقاف المزود' : 'Review pausing provider'}
            makeCommand={(form) => ({
              kind: 'pause',
              commandId: crypto.randomUUID(),
              expectedRevision: account.revision,
              reason: formText(form, 'reason'),
            })}
          >
            <p>
              {ar
                ? 'يتوقف حجز طلبات جديدة. قد تنتهي المحاولات المحجوزة بالفعل، وتبقى محسوبة من الرصيد.'
                : 'New reservations stop. Already reserved attempts may finish and remain charged.'}
            </p>
            <label>
              {ar ? 'سبب الإيقاف' : 'Pause reason'}
              <textarea name="reason" minLength={5} maxLength={1000} required />
            </label>
          </ReviewedCommandForm>
        </section>
      )}
    </div>
  );
}
