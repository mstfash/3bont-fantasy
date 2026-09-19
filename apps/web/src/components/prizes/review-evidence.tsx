import type { PrizeProposal } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
export const prizeStateLabels = {
  prepared: { ar: 'مقترح معدّ', en: 'Prepared' },
  reviewed: { ar: 'أهلية مراجعة', en: 'Eligibility reviewed' },
  approved: { ar: 'معتمد', en: 'Approved' },
  fulfilled: { ar: 'تم التسليم', en: 'Fulfilled' },
  voided: { ar: 'ملغى', en: 'Voided' },
};
export function PrizeReviewEvidence({
  locale,
  proposals,
  reviews,
}: {
  readonly locale: Locale;
  readonly proposals: readonly PrizeProposal[];
  readonly reviews: readonly {
    account_id: string;
    excluded: boolean;
    reason: string;
    evidence_reference: string;
    reviewed_by: string;
    reviewed_at: Date;
  }[];
}) {
  const ar = locale === 'ar';
  return (
    <>
      {proposals.length > 0 && (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <h2>
              {ar ? 'سجل المقترحات والاعتماد' : 'Proposal and approval history'}
            </h2>
          </div>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'الحالة' : 'State'}</th>
                  <th>{ar ? 'الإعداد' : 'Preparation'}</th>
                  <th>{ar ? 'مراجعة الأهلية' : 'Eligibility review'}</th>
                  <th>{ar ? 'الاعتماد' : 'Approval'}</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {prizeStateLabels[p.state][locale]} · v{p.revision}
                    </td>
                    <td>
                      <bdi>{p.preparedBy}</bdi>
                      <br />
                      {deadlineLabel(p.preparedAt, locale)}
                    </td>
                    <td>
                      <bdi>{p.reviewedBy ?? '—'}</bdi>
                      <br />
                      {p.reviewedAt ? deadlineLabel(p.reviewedAt, locale) : '—'}
                    </td>
                    <td>
                      <bdi>{p.approvedBy ?? '—'}</bdi>
                      <br />
                      {p.approvedAt ? deadlineLabel(p.approvedAt, locale) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <h2>
              {ar ? 'أدلة قرارات الأهلية' : 'Eligibility decision evidence'}
            </h2>
          </div>
          <div className="admin-table-scroll">
            <table className="prize-candidates">
              <thead>
                <tr>
                  <th>{ar ? 'الحساب' : 'Account'}</th>
                  <th>{ar ? 'القرار' : 'Decision'}</th>
                  <th>{ar ? 'السبب والمرجع' : 'Reason and reference'}</th>
                  <th>{ar ? 'المراجع' : 'Reviewer'}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.account_id}>
                    <td>
                      <bdi>{r.account_id}</bdi>
                    </td>
                    <td>
                      {r.excluded
                        ? ar
                          ? 'مستبعد'
                          : 'Excluded'
                        : ar
                          ? 'أزيل الاستبعاد'
                          : 'Exclusion removed'}
                    </td>
                    <td>
                      {r.reason}
                      <br />
                      {r.evidence_reference}
                    </td>
                    <td>
                      <bdi>{r.reviewed_by}</bdi>
                      <br />
                      {deadlineLabel(r.reviewed_at.toISOString(), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
