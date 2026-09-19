import type { previewGameweekResults } from '@fantasy/application';
import { PrizeResultImpact } from './prizes/result-impact';
import { RankingImpactTable } from './ranking-impact-table';
import { GroupResultImpact } from './group-result-impact';
import type { Locale } from '@/lib/brand';

type Preview = Awaited<ReturnType<typeof previewGameweekResults>>;
export function ResultImpactSummary({
  locale,
  preview,
}: {
  readonly locale: Locale;
  readonly preview: Pick<
    Preview,
    | 'rankings'
    | 'rankingPolicy'
    | 'prizes'
    | 'settled'
    | 'groupImpact'
    | 'prizeImpacts'
  >;
}) {
  const ar = locale === 'ar';
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
        <RankingImpactTable locale={locale} rankings={preview.rankings} />
      </section>
      <GroupResultImpact locale={locale} impact={preview.groupImpact} />
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
      {preview.prizeImpacts === null
        ? preview.prizes.publishedPools > 0 && (
            <p>
              {ar
                ? 'تفاصيل التوزيع متاحة لأدوار إدارة الجوائز واعتمادها فقط.'
                : 'Allocation details require prize preparation or approval access.'}
            </p>
          )
        : preview.prizeImpacts.map((impact) => (
            <PrizeResultImpact
              key={impact.pool.id}
              impact={impact}
              locale={locale}
            />
          ))}
    </>
  );
}
