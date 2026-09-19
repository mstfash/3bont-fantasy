'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  providerScheduleCommandSchema,
  type ProviderSchedule,
  type ProviderScheduleCommand,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
const fields = [
  [
    'liveIntervalMinutes',
    'Active-window interval (minutes)',
    'الفاصل في نافذة النشاط (دقائق)',
    15,
    5,
    1440,
  ],
  [
    'correctionIntervalMinutes',
    'Correction-window interval (minutes)',
    'الفاصل في نافذة التصحيح (دقائق)',
    360,
    60,
    1440,
  ],
  [
    'beforeKickoffMinutes',
    'Start before kickoff (minutes)',
    'البدء قبل المباراة (دقائق)',
    60,
    0,
    120,
  ],
  [
    'activeHours',
    'Active window after kickoff (hours)',
    'نافذة النشاط بعد البداية (ساعات)',
    8,
    3,
    24,
  ],
  [
    'correctionHours',
    'Stop after kickoff (hours)',
    'التوقف بعد البداية (ساعات)',
    72,
    24,
    168,
  ],
] as const;
export function ProviderScheduleControls({
  locale,
  accountId,
  bindingId,
  schedule,
}: {
  readonly locale: Locale;
  readonly accountId: string;
  readonly bindingId: string;
  readonly schedule: ProviderSchedule | null;
}) {
  const ar = locale === 'ar';
  const [pending, setPending] = useState<ProviderScheduleCommand | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = providerScheduleCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      accountId,
      bindingId,
      expectedRevision: schedule?.revision ?? 0,
      enabled: data.get('enabled') === 'on',
      ...Object.fromEntries(
        fields.map(([name]) => [name, Number(data.get(name))]),
      ),
      evidenceReference: data.get('evidenceReference'),
      reason: data.get('reason'),
    });
    if (!parsed.success) {
      setNotice(
        ar
          ? 'راجع فترات الجمع ومرجع التغطية والسبب.'
          : 'Check the collection intervals, coverage reference and reason.',
      );
      return;
    }
    setNotice('');
    setPending(parsed.data);
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/providers/schedules', {
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
      setNotice(
        ar
          ? 'لم يتأكد الحفظ. أعد المحاولة بنفس الطلب.'
          : 'Save not confirmed. Retry the same request.',
      );
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
        <label className="confirmation-check">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={schedule?.enabled ?? false}
          />
          {ar ? 'تفعيل الجمع لهذا الموسم' : 'Enable collection for this season'}
        </label>
        {fields.map(([name, en, arabic, fallback, min, max]) => (
          <label key={name}>
            {ar ? arabic : en}
            <input
              required
              name={name}
              type="number"
              min={min}
              max={max}
              step={1}
              defaultValue={schedule?.[name] ?? fallback}
            />
          </label>
        ))}
        <label>
          {ar
            ? 'مرجع مراجعة التغطية وحقوق الاستخدام'
            : 'Coverage and usage-rights review reference'}
          <textarea
            required
            name="evidenceReference"
            minLength={5}
            maxLength={2000}
            defaultValue={schedule?.evidenceReference ?? ''}
          />
        </label>
        <label>
          {ar ? 'سبب تغيير الجدول' : 'Reason for schedule change'}
          <textarea required name="reason" minLength={5} maxLength={1000} />
        </label>
        <button className="button-outline" disabled={busy}>
          {ar ? 'مراجعة جدول الجمع' : 'REVIEW COLLECTION SCHEDULE'}
        </button>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && (
        <div className="admin-confirmation">
          <h3>
            {pending.enabled
              ? ar
                ? 'تفعيل جمع البيانات'
                : 'Enable data collection'
              : ar
                ? 'إيقاف جمع البيانات'
                : 'Pause data collection'}
          </h3>
          <p>
            {ar
              ? `قبل المباراة بـ ${String(pending.beforeKickoffMinutes)} دقيقة، وكل ${String(pending.liveIntervalMinutes)} دقيقة حتى ${String(pending.activeHours)} ساعات بعد البداية، ثم كل ${String(pending.correctionIntervalMinutes)} دقيقة حتى ${String(pending.correctionHours)} ساعة.`
              : `Start ${String(pending.beforeKickoffMinutes)} minutes before kickoff; collect every ${String(pending.liveIntervalMinutes)} minutes until ${String(pending.activeHours)} hours after kickoff, then every ${String(pending.correctionIntervalMinutes)} minutes until ${String(pending.correctionHours)} hours.`}
          </p>
          <p>
            {ar
              ? 'كل دفعة تحتاج أربعة طلبات قبل احتساب الإعادات. التعديل يلغي الدفعات المعلقة القديمة، والطلبات المحجوزة بالفعل تبقى محسوبة. التفعيل يحتاج أيضاً حساب مزود مُفعّلاً ومفتاح العامل وتشغيل الجمع في إعدادات الخادم.'
              : 'Each batch needs four requests before retries. Changes cancel older pending batches; already reserved requests remain charged. Collection also requires an enabled provider account, the worker key and server automation setting.'}
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
            {ar ? 'تأكيد جدول الجمع' : 'CONFIRM COLLECTION SCHEDULE'}
          </button>
        </div>
      )}
    </>
  );
}
