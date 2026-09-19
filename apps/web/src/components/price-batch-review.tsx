'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import type { PriceBatchCommand, PricePreview } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
const reasons: Record<
  PricePreview['changes'][number]['reason'],
  { ar: string; en: string }
> = {
  pinned: { ar: 'مثبت يدوياً', en: 'Manually pinned' },
  'insufficient-history': { ar: 'جولات غير كافية', en: 'Not enough rounds' },
  'incomplete-data': { ar: 'بيانات ناقصة', en: 'Incomplete data' },
  'insufficient-minutes': { ar: 'دقائق غير كافية', en: 'Not enough minutes' },
  rise: { ar: 'أداء أعلى من الحد', en: 'Above rise threshold' },
  fall: { ar: 'أداء أقل من الحد', en: 'Below fall threshold' },
  'within-band': { ar: 'ضمن نطاق الثبات', en: 'Within hold band' },
  'at-bound': { ar: 'وصل لحد السعر', en: 'Price bound reached' },
};
const blocks: Record<
  NonNullable<PricePreview['blocked']>,
  { ar: string; en: string }
> = {
  'results-under-review': {
    ar: 'توجد نتائج أعيد فتحها أو تحتاج مراجعة.',
    en: 'A previously finalized result is reopened or under review.',
  },
  'no-new-finalized-round': {
    ar: 'لا توجد جولة نهائية جديدة متاحة لهذه الدفعة.',
    en: 'No newly finalized round is available for this batch.',
  },
  'no-editing-round': {
    ar: 'لا توجد جولة مستقبلية متاحة للتعديل.',
    en: 'There is no upcoming editable gameweek.',
  },
  'freeze-window': {
    ar: 'الأسعار مجمدة قرب موعد الجولة. تؤجل الدفعة للنافذة التالية.',
    en: 'Prices are frozen near the deadline. Defer this batch to the next window.',
  },
  'already-published-for-round': {
    ar: 'نُشرت دفعة لهذه الجولة بالفعل. لا تتكرر الزيادة في النافذة نفسها.',
    en: 'A batch has already been published for this editing window.',
  },
};
export function PriceBatchReview({
  locale,
  preview,
  names,
}: {
  readonly locale: Locale;
  readonly preview: PricePreview;
  readonly names: Readonly<Record<string, string>>;
}) {
  const ar = locale === 'ar';
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PriceBatchCommand | null>(null);
  const changed = preview.changes.filter(
    (p) => p.newPrice !== p.oldPrice,
  ).length;
  function review(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    if (typeof reason === 'string')
      setPending({
        commandId: crypto.randomUUID(),
        competitionId: preview.competitionId,
        expectedFingerprint: preview.fingerprint,
        reason,
      });
  }
  async function save(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/prices', {
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
            ? 'جدّد التحقق من الجلسة في صفحة الأمان.'
            : 'Refresh staff verification on the Security page.'
          : ar
            ? 'تغيرت المعاينة أو انتهت نافذة النشر. حدّث الصفحة.'
            : 'The preview changed or the publication window closed. Reload this page.',
      );
    } catch {
      setNotice(
        ar
          ? 'لم يتأكد النشر. أعد نفس الطلب.'
          : 'Publication not confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>{ar ? 'معاينة الدفعة' : 'Batch preview'}</h2>
          <span>
            {changed} {ar ? 'سعر متغير' : 'price changes'}
          </span>
        </div>
        <p>
          {ar
            ? `صافي تغير السوق: ${(preview.netChange / 10).toFixed(1)} وحدة. الرصيد وأسعار الشراء للفرق الموجودة لا تتغير.`
            : `Net market change: ${(preview.netChange / 10).toFixed(1)} units. Existing squad banks and purchase prices stay unchanged.`}
        </p>
        {preview.publishBefore && (
          <p>
            {ar ? 'النشر متاح قبل:' : 'Publish before:'}{' '}
            {deadlineLabel(preview.publishBefore, locale)}
          </p>
        )}
        {preview.blocked && (
          <p role="status">{blocks[preview.blocked][locale]}</p>
        )}
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'اللاعب' : 'Footballer'}</th>
                <th>{ar ? 'الحالي' : 'Current'}</th>
                <th>{ar ? 'المقترح' : 'Proposed'}</th>
                <th>{ar ? 'متوسط النقاط' : 'Mean points'}</th>
                <th>{ar ? 'الدقائق' : 'Minutes'}</th>
                <th>{ar ? 'السبب' : 'Reason'}</th>
              </tr>
            </thead>
            <tbody>
              {preview.changes.map((p) => (
                <tr key={p.footballerId}>
                  <td>
                    {names[p.footballerId]}
                    <small className="price-sources">
                      {p.observations
                        .map(
                          (h) =>
                            `${ar ? 'جولة' : 'GW'} ${String(h.number)} / ${ar ? 'نسخة' : 'v'}${String(h.revision)}`,
                        )
                        .join(' · ')}
                    </small>
                  </td>
                  <td>{(p.oldPrice / 10).toFixed(1)}</td>
                  <td>{(p.newPrice / 10).toFixed(1)}</td>
                  <td>
                    {p.observations.length
                      ? (
                          Number(p.pointsSum) /
                          p.observations.length /
                          1000
                        ).toFixed(2)
                      : '—'}
                  </td>
                  <td>{p.minutesSum}</td>
                  <td>{reasons[p.reason][locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!preview.blocked && (
        <section className="admin-panel">
          <form
            className="admin-form"
            onSubmit={review}
            onChange={() => {
              setPending(null);
            }}
          >
            <label>
              {ar ? 'سبب اعتماد هذه الدفعة' : 'Reason for approving this batch'}
              <textarea name="reason" required minLength={5} maxLength={1000} />
            </label>
            <label className="confirmation-check">
              <input type="checkbox" required />
              {ar
                ? 'راجعت الأسعار ومصادر النقاط وتأثير التغيير.'
                : 'I reviewed the prices, score sources and impact.'}
            </label>
            <button type="submit" className="button-outline" disabled={busy}>
              {ar ? 'مراجعة النشر' : 'REVIEW PUBLICATION'}
            </button>
          </form>
          {pending && (
            <div className="admin-confirmation">
              <p>
                {ar
                  ? `اعتماد ${String(changed)} تغيراً واستهلاك ${String(preview.sourceGameweekIds.length)} جولة مصدر لهذه الدفعة.`
                  : `Approve ${String(changed)} changes and consume ${String(preview.sourceGameweekIds.length)} source rounds for this batch.`}
              </p>
              <button
                className="action-button"
                disabled={busy}
                onClick={() => {
                  void save();
                }}
                type="button"
              >
                {ar ? 'تأكيد نشر الأسعار' : 'CONFIRM PRICE PUBLICATION'}
              </button>
            </div>
          )}
          {notice && <p role="alert">{notice}</p>}
        </section>
      )}
    </>
  );
}
