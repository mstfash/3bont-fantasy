import type {
  PrizeCorrectionCase,
  PrizeProposal,
  PrizeCorrectionObservation,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { prizeRewardLabel } from './prize-summary';
import { PrizeCorrectionAction } from './correction-action';
export function PrizeCorrectionCases({
  locale,
  cases,
  proposals,
  currency,
  canApprove,
  history,
}: {
  readonly locale: Locale;
  readonly cases: readonly PrizeCorrectionCase[];
  readonly proposals: readonly PrizeProposal[];
  readonly currency: string;
  readonly canApprove: boolean;
  readonly history: readonly {
    case_id: string;
    revision: number;
    observed_at: Date;
    payload: PrizeCorrectionObservation;
  }[];
}) {
  const ar = locale === 'ar';
  return (
    <>
      {cases.map((review) => {
        const original = proposals.find((p) => p.id === review.proposalId),
          current = review.observation.preview;
        const before = new Map(
            original?.preview.awards.map((a) => [a.entryId, a]),
          ),
          after = new Map(current?.awards.map((a) => [a.entryId, a]));
        return (
          <section
            className="admin-panel"
            key={review.id}
            aria-label={
              ar ? 'مراجعة تصحيح جائزة مسلّمة' : 'Delivered award correction'
            }
          >
            <div className="admin-panel-heading">
              <h2>{ar ? 'تصحيح بعد التسليم' : 'POST-DELIVERY CORRECTION'}</h2>
              <span>
                {review.state === 'open'
                  ? ar
                    ? 'تحتاج مراجعة'
                    : 'Needs review'
                  : ar
                    ? 'تمت المراجعة'
                    : 'Reviewed'}
              </span>
            </div>
            <p className="panel-note">
              {deadlineLabel(review.openedAt, locale)} ·{' '}
              {ar ? 'نسخة الحالة' : 'Case revision'} {review.revision}
            </p>
            {review.observation.hold && (
              <p className="panel-note">
                {commandError(review.observation.hold, locale)}
              </p>
            )}
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ar ? 'الفريق' : 'Squad'}</th>
                    <th>{ar ? 'التسليم الأصلي' : 'Original delivery'}</th>
                    <th>
                      {ar ? 'حسب الأدلة الحالية' : 'Under current evidence'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...before.keys(), ...after.keys()])].map(
                    (id) => {
                      const a = before.get(id),
                        b = after.get(id);
                      return (
                        <tr key={id}>
                          <td>{b?.entryName ?? a?.entryName}</td>
                          <td>
                            {a
                              ? `${String(a.rank)} · ${prizeRewardLabel(a.reward, currency, locale)}`
                              : ar
                                ? 'لا جائزة'
                                : 'No award'}
                          </td>
                          <td>
                            {!current
                              ? ar
                                ? 'بانتظار نتائج نهائية'
                                : 'Awaiting final evidence'
                              : b
                                ? `${String(b.rank)} · ${prizeRewardLabel(b.reward, currency, locale)}`
                                : ar
                                  ? 'لا جائزة'
                                  : 'No award'}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
            <details className="panel-note">
              <summary>
                {ar
                  ? 'سجل الأدلة المرصودة — آخر ١٠٠ سجل للجائزة'
                  : 'Observed evidence — latest 100 records for this pool'}
              </summary>
              <ol>
                {history
                  .filter((h) => h.case_id === review.id)
                  .map((h) => (
                    <li key={h.revision}>
                      {deadlineLabel(h.observed_at.toISOString(), locale)} ·{' '}
                      {ar ? 'نسخة' : 'Revision'} {h.revision} ·{' '}
                      {h.payload.hold
                        ? commandError(h.payload.hold, locale)
                        : ar
                          ? 'أدلة نهائية متاحة'
                          : 'Final evidence available'}
                    </li>
                  ))}
              </ol>
            </details>
            {review.resolution ? (
              <div className="panel-note">
                <h3>
                  {review.resolution.decision === 'original-delivery-stands'
                    ? ar
                      ? 'الإبقاء على التسليم الأصلي'
                      : 'Original delivery stands'
                    : ar
                      ? 'سُجّلت تسوية خارجية'
                      : 'External remedy recorded'}
                </h3>
                <p className="preserve-lines">{review.resolution.reason}</p>
                <p>{review.resolution.reference}</p>
                <p>{deadlineLabel(review.resolution.resolvedAt, locale)}</p>
              </div>
            ) : canApprove && current && !review.observation.hold ? (
              <div className="panel-note">
                <PrizeCorrectionAction locale={locale} review={review} />
              </div>
            ) : (
              <p className="panel-note">
                {ar
                  ? 'يلزم اكتمال الأدلة ومراجعة معتمد جوائز مستقل.'
                  : 'Final evidence and an independent prize approver are required.'}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
