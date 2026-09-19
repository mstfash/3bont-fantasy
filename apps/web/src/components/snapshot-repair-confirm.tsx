'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  snapshotRepairCommandSchema,
  type SnapshotRepairCommand,
  type SnapshotRepairSelection,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
export function SnapshotRepairConfirm({
  locale,
  selection,
  fingerprint,
}: {
  readonly locale: Locale;
  readonly selection: SnapshotRepairSelection;
  readonly fingerprint: string;
}) {
  const ar = locale === 'ar';
  const [pending, setPending] = useState<SnapshotRepairCommand | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = snapshotRepairCommandSchema.safeParse({
      commandId: crypto.randomUUID(),
      selection,
      expectedFingerprint: fingerprint,
      reason: new FormData(event.currentTarget).get('reason'),
    });
    if (parsed.success) setPending(parsed.data);
    else setNotice(commandError('invalid-request', locale));
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/snapshot-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.assign(
          `/${locale}/admin/results/${selection.gameweekId}`,
        );
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
        <h2>{ar ? 'اعتماد إصلاح السجل' : 'Approve snapshot repair'}</h2>
        <p>
          {ar
            ? 'يُفتح التصحيح وتُنشر النقاط المستعادة في معاملة واحدة. يبقى السجل الأصلي والانتقالات والأرصدة والشيبس اللاحقة كما سُجلت. تبدأ نافذة التصحيح مجدداً وتظل الجوائز خاضعة لشروط اعتمادها.'
            : 'Reopening and restored scores publish together. The original record and later transfers, balances and chip inventory remain recorded. The correction window restarts and prize approval remains subject to its rules.'}
        </p>
        <fieldset disabled={busy}>
          <label>
            {ar ? 'سبب إصلاح السجل' : 'Snapshot repair reason'}
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <label className="confirmation-check">
            <input type="checkbox" required />
            {ar
              ? 'راجعت دليل قبول الاختيارات وأثر الإصلاح على النقاط والترتيب والجوائز.'
              : 'I reviewed the accepted-command evidence and the score, ranking and prize impact.'}
          </label>
          <button type="submit" className="button-outline">
            {ar ? 'مراجعة إصلاح السجل' : 'REVIEW SNAPSHOT REPAIR'}
          </button>
        </fieldset>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && (
        <div className="admin-confirmation">
          <p>{pending.reason}</p>
          <button
            type="button"
            className="action-button"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد إصلاح السجل' : 'CONFIRM SNAPSHOT REPAIR'}
          </button>
        </div>
      )}
    </section>
  );
}
