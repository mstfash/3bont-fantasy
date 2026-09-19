'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import type { Locale } from '@/lib/brand';
import type { ResultCommand } from '@fantasy/contracts';
export function ReopenResults({
  locale,
  gameweekId,
  revision,
  fingerprint,
}: {
  readonly locale: Locale;
  readonly gameweekId: string;
  readonly revision: number;
  readonly fingerprint: string;
}) {
  const ar = locale === 'ar';
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ResultCommand | null>(null);
  function review(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    if (typeof reason === 'string')
      setPending({
        kind: 'reopen',
        commandId: crypto.randomUUID(),
        gameweekId,
        expectedResultRevision: revision,
        expectedFingerprint: fingerprint,
        reason,
      });
  }
  async function confirm(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body: unknown = await response.json();
      const { code } = z.object({ code: z.string() }).parse(body);
      setNotice(
        code === 'staff-verification-required'
          ? ar
            ? 'جدّد تحقق الجلسة في صفحة الأمان.'
            : 'Refresh session verification on the Security page.'
          : ar
            ? 'تغيرت البيانات أو النتيجة. حدّث المعاينة قبل المحاولة.'
            : 'The data or result changed. Refresh this preview before trying again.',
      );
    } catch {
      setNotice(
        ar ? 'لم يتأكد الطلب. أعد المحاولة.' : 'Request not confirmed. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-panel">
      <form
        className="admin-form"
        onSubmit={review}
        onChange={() => {
          setPending(null);
        }}
      >
        <h2>{ar ? 'إعادة فتح النتائج' : 'Reopen results'}</h2>
        <p>
          {ar
            ? 'ستبقى النسخة المنشورة حتى اكتمال الحساب الجديد. تعود الجولة مؤقتة وتبدأ نافذة التصحيح من جديد.'
            : 'The published version stays visible until recalculation completes. The gameweek becomes provisional and starts a new correction window.'}
        </p>
        <label>
          {ar
            ? 'سبب الموافقة على إعادة الفتح'
            : 'Reason for approving the reopening'}
          <textarea name="reason" minLength={5} maxLength={1000} required />
        </label>
        <label className="confirmation-check">
          <input required type="checkbox" />
          {ar
            ? 'راجعت تأثير التغيير على الفرق والترتيب وقرارات الجوائز المرتبطة.'
            : 'I reviewed the impact on squads, standings and affected prize decisions.'}
        </label>
        <button className="button-outline" type="submit" disabled={busy}>
          {ar ? 'مراجعة إعادة الفتح' : 'REVIEW REOPENING'}
        </button>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && (
        <div className="admin-confirmation">
          <p>{pending.reason}</p>
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد إعادة الفتح' : 'CONFIRM REOPENING'}
          </button>
        </div>
      )}
    </div>
  );
}
