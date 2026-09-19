import type { previewGameweekResults } from '@fantasy/application';
import type { Locale } from '@/lib/brand';

type Preview = Awaited<ReturnType<typeof previewGameweekResults>>;
export function ResultImpactSummary({
  locale,
  preview,
}: {
  readonly locale: Locale;
  readonly preview: Pick<
    Preview,
    'rankings' | 'rankingPolicy' | 'prizes' | 'settled'
  >;
}) {
  const ar = locale === 'ar';
  const changed =
    preview.rankings?.filter(
      (row) =>
        row.beforeRank !== row.afterRank ||
        row.beforePoints !== row.afterPoints,
    ) ?? [];
  return (
    <>
      <section className="admin-panel" aria-labelledby="ranking-impact-title">
        <h2 id="ranking-impact-title">
          {ar ? 'أثر التغيير على الترتيب العام' : 'Overall ranking impact'}
        </h2>
        <p>
          {ar
            ? 'تستبدل هذه المعاينة نتيجة الجولة وحدها، مع إبقاء نتائج الجولات الأخرى المنشورة كما هي. تظهر الفرق التي تحرك ترتيبها حتى إن لم تتغير نقاطها.'
            : 'This preview replaces only this gameweek’s result, keeping other published rounds unchanged. It includes squads whose rank moves even when their own points stay the same.'}
        </p>
        <p>
          {preview.rankingPolicy === 'shared'
            ? ar
              ? 'التعادل: ترتيب مشترك (١، ١، ٣).'
              : 'Ties: shared ranks (1, 1, 3).'
            : ar
              ? 'كسر التعادل: خصومات انتقالات أقل، ثم أهداف أكثر.'
              : 'Tie-breaks: fewer transfer deductions, then more goals.'}
        </p>
        {!preview.settled && (
          <p role="status">
            {ar
              ? 'هذه تقديرات مؤقتة؛ بيانات الجولة لم تكتمل بعد.'
              : 'These projections are provisional; the round’s data is not yet complete.'}
          </p>
        )}
        {preview.rankings === null ? (
          <p role="status">
            {ar
              ? 'تعذرت معاينة الترتيب لأن نتيجة فريق واحد على الأقل غير متاحة للحساب.'
              : 'Ranking projection is unavailable because at least one squad cannot be scored.'}
          </p>
        ) : changed.length === 0 ? (
          <p>
            {ar
              ? 'لا تغيير في الترتيب أو مجموع النقاط.'
              : 'No changes to overall ranks or point totals.'}
          </p>
        ) : (
          <>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ar ? 'الفريق' : 'Squad'}</th>
                    <th>{ar ? 'الترتيب المنشور' : 'Published rank'}</th>
                    <th>{ar ? 'الترتيب المقترح' : 'Proposed rank'}</th>
                    <th>{ar ? 'المجموع المنشور' : 'Published total'}</th>
                    <th>{ar ? 'المجموع المقترح' : 'Proposed total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.slice(0, 200).map((row) => (
                    <tr key={row.entryId}>
                      <td>{row.name}</td>
                      <td>{row.beforeRank}</td>
                      <td>{row.afterRank}</td>
                      <td>{row.beforePoints / 1000}</td>
                      <td>{row.afterPoints / 1000}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {changed.length > 200 && (
              <p>
                {ar
                  ? `تظهر أول ٢٠٠ من ${String(changed.length)} فريق متأثر.`
                  : `Showing the first 200 of ${String(changed.length)} affected squads.`}
              </p>
            )}
          </>
        )}
        <p>
          {ar
            ? 'ترتيب المجموعات والمواجهات المباشرة له نطاقه الخاص ولا يظهر في هذا الجدول.'
            : 'Group standings and head-to-head matchups have their own scope and are not projected in this table.'}
        </p>
      </section>
      <section className="admin-panel" aria-labelledby="prize-impact-title">
        <h2 id="prize-impact-title">
          {ar
            ? 'الجوائز المرتبطة بهذه الجولة'
            : 'Prizes affected by this gameweek'}
        </h2>
        {preview.prizes.publishedPools === 0 ? (
          <p>
            {ar
              ? 'لا توجد مجموعات جوائز منشورة تشمل هذه الجولة.'
              : 'No published prize pools include this gameweek.'}
          </p>
        ) : (
          <>
            <div className="admin-metrics">
              <article>
                <span>{ar ? 'مجموعات الجوائز' : 'Prize pools'}</span>
                <strong>{preview.prizes.publishedPools}</strong>
              </article>
              <article>
                <span>
                  {ar ? 'قرارات بانتظار التسليم' : 'Pending award decisions'}
                </span>
                <strong>{preview.prizes.pendingProposals}</strong>
              </article>
              <article>
                <span>
                  {ar ? 'قرارات تم تسليمها' : 'Delivered award decisions'}
                </span>
                <strong>{preview.prizes.fulfilledProposals}</strong>
              </article>
              <article>
                <span>
                  {ar ? 'حالات تصحيح مفتوحة' : 'Open correction cases'}
                </span>
                <strong>{preview.prizes.openCorrections}</strong>
              </article>
            </div>
            <p>
              {ar
                ? 'بعد إعادة الفتح، يتوقف اعتماد وتسليم الجوائز المعلقة حتى تصبح جميع جولات نافذة الجائزة نهائية من جديد وتُراجع المعاينة المحدثة.'
                : 'Reopening holds approval and delivery of pending awards until every round in the prize window is final again and the updated preview is reviewed.'}
            </p>
            {preview.prizes.fulfilledProposals > 0 && (
              <p>
                {ar
                  ? 'الجوائز المسلّمة تبقى محفوظة في السجل. يتابع نظام مراجعة الجوائز أثر التصحيح في حالة منفصلة؛ إعادة فتح الجولة لا تسترد جائزة أو تنشئ دفعة تلقائياً.'
                  : 'Delivered awards remain in the record. Prize reconciliation tracks the correction in a separate review case; reopening does not recover an award or issue a payment.'}
              </p>
            )}
            <p>
              {ar
                ? 'الأرقام أعلاه توضح القرارات التي تحتاج مراجعة، وليست توقعاً للفائزين أو المبالغ الجديدة.'
                : 'These counts identify decisions that need review; they do not predict new winners or award amounts.'}
            </p>
          </>
        )}
      </section>
    </>
  );
}
