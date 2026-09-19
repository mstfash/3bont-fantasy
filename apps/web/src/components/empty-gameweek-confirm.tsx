'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  emptyGameweekCommandSchema,
  type EmptyGameweekCommand,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
export function EmptyGameweekConfirm({
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
  const [pending, setPending] = useState<EmptyGameweekCommand | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emptyGameweekCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      gameweekId,
      expectedResultRevision: revision,
      expectedFingerprint: fingerprint,
      reason: new FormData(event.currentTarget).get('reason'),
    });
    if (parsed.success) setPending(parsed.data);
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/empty-gameweek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.assign(`/${locale}/admin/results/${gameweekId}`);
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
    <section className="admin-panel">
      <form
        className="admin-form"
        onSubmit={review}
        onChange={() => {
          setPending(null);
        }}
      >
        <h2>
          {ar ? 'اعتماد تسوية الجولة' : 'Approve zero-performance settlement'}
        </h2>
        <p>
          {ar
            ? 'لا نقاط أداء للاعبين. تبقى خصومات الانتقالات والشيبس المستهلكة والاختيارات المسجلة. تبدأ نافذة التصحيح مجدداً وتظل الجوائز محجوبة حتى اكتمال شروطها.'
            : 'Footballer performance contributes zero. Transfer deductions, consumed chips and recorded selections remain. The correction window restarts and prize approval stays subject to finality.'}
        </p>
        <label>
          {ar ? 'سبب تسوية الجولة' : 'Settlement reason'}
          <textarea required name="reason" minLength={5} maxLength={1000} />
        </label>
        <label className="confirmation-check">
          <input type="checkbox" required />
          {ar
            ? 'راجعت جميع المباريات والقرارات والنقاط والجوائز المتأثرة.'
            : 'I reviewed every fixture, disposition, score and affected award.'}
        </label>
        <button className="button-outline" type="submit" disabled={busy}>
          {ar ? 'مراجعة التسوية' : 'REVIEW SETTLEMENT'}
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
            {ar ? 'تأكيد تسوية الجولة' : 'CONFIRM SETTLEMENT'}
          </button>
        </div>
      )}
    </section>
  );
}
