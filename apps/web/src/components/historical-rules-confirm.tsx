'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  historicalRuleCommandSchema,
  type HistoricalRuleSelection,
  type HistoricalRuleCommand,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
export function HistoricalRulesConfirm({
  locale,
  selection,
  fingerprint,
}: {
  readonly locale: Locale;
  readonly selection: HistoricalRuleSelection;
  readonly fingerprint: string;
}) {
  const ar = locale === 'ar';
  const [pending, setPending] = useState<HistoricalRuleCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  function review(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = historicalRuleCommandSchema.safeParse({
      kind: 'replay-rules',
      commandId: crypto.randomUUID(),
      selection,
      expectedFingerprint: fingerprint,
      reason: new FormData(event.currentTarget).get('reason'),
    });
    if (parsed.success) setPending(parsed.data);
  }
  async function confirm(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/historical-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.assign(
          `/${locale}/admin/results/${selection.gameweekId}/rules`,
        );
        return;
      }
      const body: unknown = await response.json();
      const { code } = z.object({ code: z.string() }).parse(body);
      setNotice(commandError(code, locale));
      if (['preview-changed', 'results-changed'].includes(code))
        setPending(null);
    } catch {
      setNotice(
        ar
          ? 'لم يتأكد الطلب. أعد نفس التأكيد.'
          : 'Request not confirmed. Retry the same confirmation.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <h2>{ar ? 'اعتماد تصحيح القواعد' : 'Approve rule correction'}</h2>
      <p>
        {ar
          ? 'ينشر التأكيد نسخة نتائج جديدة دفعة واحدة ويبدأ نافذة التصحيح مجدداً. تبقى النتائج والقواعد السابقة في السجل. اعتماد التصحيح لا يصرف جائزة أو يسترد جائزة مسلّمة.'
          : 'Confirmation publishes a complete new result revision and restarts the correction window. Previous results and rules remain recorded. This action does not pay or recover an award.'}
      </p>
      <form
        className="admin-form"
        onSubmit={review}
        onChange={() => {
          setPending(null);
        }}
      >
        <label>
          {ar ? 'سبب التصحيح ودليله' : 'Correction reason and evidence'}
          <textarea name="reason" required minLength={5} maxLength={1000} />
        </label>
        <label className="confirmation-check">
          <input type="checkbox" required />
          {ar
            ? 'راجعت القواعد والنقاط والترتيب والمواجهات والجوائز المتأثرة.'
            : 'I reviewed the rules, points, standings, H2H and affected prize decisions.'}
        </label>
        <button type="submit" className="button-outline" disabled={busy}>
          {ar ? 'مراجعة الاعتماد' : 'REVIEW APPROVAL'}
        </button>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && (
        <div className="admin-confirmation">
          <p>{pending.reason}</p>
          <button
            type="button"
            disabled={busy}
            className="action-button"
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد تصحيح القواعد' : 'CONFIRM RULE CORRECTION'}
          </button>
        </div>
      )}
    </section>
  );
}
