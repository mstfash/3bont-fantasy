import Link from 'next/link';
import type { previewPrizeResultCorrection } from '@fantasy/application';
import type { PrizePreview } from '@fantasy/contracts';
import { currencyMinorToDecimal } from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
import { InfoTip } from '@/components/help/info-tip';
import { prizeRewardLabel } from './prize-summary';
import { prizeStateLabels } from './review-evidence';

type Impact = Awaited<
  ReturnType<typeof previewPrizeResultCorrection>
>['impact'];
function holdLabel(code: string, ar: boolean) {
  if (code === 'round-results-unavailable')
    return ar
      ? 'لم تُنشر نتائج كل جولات نافذة الجائزة بعد.'
      : 'Not every round in the prize window has published results.';
  if (code === 'correction-incomplete')
    return ar
      ? 'بيانات التصحيح أو نتائج الفرق غير مكتملة.'
      : 'Correction facts or squad results are incomplete.';
  if (code.startsWith('goods-tie-needs-resolution:'))
    return ar
      ? 'تعادل في جائزة عينية يحتاج إلى تسوية وفق الشروط المنشورة.'
      : 'A tied goods award needs resolution under the published terms.';
  return commandError(
    code.startsWith('prize-') ? code : `prize-${code}`,
    ar ? 'ar' : 'en',
  );
}
function AwardComparison({
  before,
  after,
  currency,
  locale,
  recorded = false,
}: {
  readonly before: PrizePreview | null;
  readonly after: PrizePreview;
  readonly currency: string;
  readonly locale: Locale;
  readonly recorded?: boolean;
}) {
  const ar = locale === 'ar';
  const prior = new Map(before?.awards.map((a) => [a.entryId, a]) ?? []);
  const projected = new Map(after.awards.map((a) => [a.entryId, a]));
  const rows = [
    ...new Map(
      [...(before?.awards ?? []), ...after.awards].map((a) => [a.entryId, a]),
    ).values(),
  ];
  return (
    <>
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{ar ? 'الفريق' : 'Squad'}</th>
              <th>
                {recorded
                  ? ar
                    ? 'المركز المسجل'
                    : 'Recorded rank'
                  : ar
                    ? 'المركز بالنقاط المنشورة'
                    : 'Published-score rank'}
              </th>
              <th>{ar ? 'المركز المقترح' : 'Projected rank'}</th>
              <th>
                {recorded
                  ? ar
                    ? 'الجائزة المسجلة'
                    : 'Recorded award'
                  : ar
                    ? 'الجائزة بالنقاط المنشورة'
                    : 'Published-score award'}
              </th>
              <th>{ar ? 'الجائزة المقترحة' : 'Projected award'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((row) => {
              const a = prior.get(row.entryId);
              const b = projected.get(row.entryId);
              return (
                <tr key={row.entryId}>
                  <td>{row.entryName}</td>
                  <td>{a?.rank ?? '—'}</td>
                  <td>{b?.rank ?? '—'}</td>
                  <td>
                    {a ? prizeRewardLabel(a.reward, currency, locale) : '—'}
                  </td>
                  <td>
                    {b ? prizeRewardLabel(b.reward, currency, locale) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 200 && (
        <p>
          {ar
            ? `عرض أول ٢٠٠ من ${String(rows.length)} مستفيد حالي أو محتمل.`
            : `Showing the first 200 of ${String(rows.length)} recorded or potential recipients.`}
        </p>
      )}
      <p>
        {ar ? 'باقي القسمة: قبل / بعد' : 'Tie residue: before / after'}:{' '}
        <bdi>
          {before ? currencyMinorToDecimal(before.residueMinor, currency) : '—'}{' '}
          / {currencyMinorToDecimal(after.residueMinor, currency)} {currency}
        </bdi>
      </p>
      <p>
        {ar
          ? 'مبالغ بلا مستفيد: قبل / بعد'
          : 'Unallocated cash: before / after'}
        :{' '}
        <bdi>
          {before
            ? currencyMinorToDecimal(before.unallocatedMinor, currency)
            : '—'}{' '}
          / {currencyMinorToDecimal(after.unallocatedMinor, currency)}{' '}
          {currency}
        </bdi>
      </p>
    </>
  );
}
export function PrizeResultImpact({
  impact,
  locale,
}: {
  readonly impact: Impact;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  const title = ar ? 'التوزيع المقترح للجوائز' : 'Projected prize allocation';
  return (
    <section
      className="admin-panel"
      aria-label={`${title}: ${impact.pool.name[locale]}`}
    >
      <h3>{impact.pool.name[locale]}</h3>
      <InfoTip
        locale={locale}
        label={title}
        text={
          ar
            ? 'تستخدم المقارنة أهلية واحدة حالية وعضوية الدوري عند موعد إغلاق الأهلية. تستبدل نتيجة الجولة المحددة فقط. المقترح ليس قرار اعتماد أو دفع أو استرداد.'
            : 'Both estimates use the same current eligibility and group membership at the eligibility cutoff. Only the selected round is replaced. A projection is not an approval, payment or recovery instruction.'
        }
      />
      <p>
        {ar
          ? 'تقدير بالنقاط المنشورة مقارنة بالتصحيح المقترح، وفق الأهلية الحالية. تبقى قرارات الجوائز المسجلة محفوظة.'
          : 'Published-score estimate compared with the proposed correction, using current eligibility. Recorded award decisions remain unchanged.'}
      </p>
      {impact.holds.length > 0 && (
        <div role="status">
          <h4>{ar ? 'التوزيع المقترح معلّق' : 'Projection on hold'}</h4>
          {impact.holds.map((hold) => (
            <p key={hold}>{holdLabel(hold, ar)}</p>
          ))}
        </div>
      )}
      {impact.after && (
        <AwardComparison
          before={impact.before}
          after={impact.after}
          currency={impact.pool.currency}
          locale={locale}
        />
      )}
      {impact.before === null && (
        <p>
          {ar
            ? 'التقدير بالنقاط المنشورة غير متاح حالياً.'
            : 'The published-score estimate is currently unavailable.'}{' '}
          {impact.beforeIssues.map((code) => holdLabel(code, ar)).join(' · ')}
        </p>
      )}
      {impact.recorded.map((decision) => (
        <details key={decision.id}>
          <summary>
            {ar ? 'قرار مسجل' : 'Recorded decision'}:{' '}
            {prizeStateLabels[decision.state][locale]}
          </summary>
          <p>
            {ar
              ? 'هذا السجل لا يتغير بفتح المعاينة أو إعادة فتح النتائج. تتطلب التسوية مسار مراجعة منفصلاً.'
              : 'This record is not changed by previewing or reopening results. Any settlement needs the separate correction-review workflow.'}
          </p>
          {impact.after ? (
            <AwardComparison
              before={decision.preview}
              after={impact.after}
              currency={impact.pool.currency}
              locale={locale}
              recorded
            />
          ) : (
            <p>
              {ar
                ? 'المقارنة مع هذا القرار معلقة حتى اكتمال أدلة التصحيح.'
                : 'Comparison with this decision is held until correction evidence is complete.'}
            </p>
          )}
        </details>
      ))}
      <Link href={`/${locale}/admin/prizes/${impact.pool.id}`}>
        {ar
          ? 'افتح عمليات الجائزة وسجلها'
          : 'Open prize operations and history'}{' '}
        ↗
      </Link>
    </section>
  );
}
