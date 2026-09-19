import { currencyMinorToDecimal } from '@fantasy/domain';
import type { PrizePool, PrizeReward } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
export function prizeRewardLabel(
  reward: PrizeReward,
  currency: string,
  locale: Locale,
): string {
  if (reward.kind === 'cash')
    return `${currencyMinorToDecimal(reward.amountMinor, currency)} ${currency}`;
  const equivalent =
    reward.cashEquivalentMinor === null
      ? ''
      : ` · ${locale === 'ar' ? 'بديل التعادل' : 'tie equivalent'} ${currencyMinorToDecimal(reward.cashEquivalentMinor, currency)} ${currency}`;
  return `${reward.name[locale]}${equivalent}`;
}
export function PrizeSummary({
  pool,
  locale,
}: {
  readonly pool: PrizePool;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  return (
    <section className="group-card">
      <span className="eyebrow">
        {pool.synthetic
          ? ar
            ? 'تجربة اصطناعية — لا جوائز حقيقية'
            : 'SYNTHETIC REHEARSAL — NO REAL AWARDS'
          : ar
            ? 'شروط الجائزة'
            : 'PRIZE TERMS'}
      </span>
      <h2>{pool.name[locale]}</h2>
      <p className="preserve-lines">{pool.description[locale]}</p>
      <p>
        {ar ? 'إغلاق الأهلية: ' : 'Eligibility cutoff: '}
        {deadlineLabel(pool.eligibilityCutoff, locale)}
      </p>
      <p>
        {pool.oneAwardPerAccount
          ? ar
            ? 'جائزة واحدة لكل حساب باستخدام أعلى فريق مؤهل.'
            : 'One award per account using its highest-ranked eligible squad.'
          : ar
            ? 'قد يفوز الحساب بأكثر من جائزة من فرقه المؤهلة.'
            : 'An account may win more than one award through its eligible squads.'}
      </p>
      <p>
        {ar
          ? 'تُجمع قيم الجوائز التي تشغلها المراكز المتعادلة وتُقسّم بالتساوي. يُحتفظ بالباقي. الجوائز العينية المتعادلة تستخدم البديل النقدي المعلن، أو تتوقف للاعتماد حتى حل التعادل وفق الشروط.'
          : 'Tied entries pool the prizes for their occupied places and split equally, with any residue retained. Tied goods use the published cash equivalent; without one, approval waits for resolution under these terms.'}
      </p>
      <p>
        {ar
          ? 'يلزم تفعيل الفريق قبل إغلاق الأهلية، وعضوية المجموعة عند هذا الموعد إن كانت الجائزة لمجموعة. يلزم حساب مؤكّد غير موقوف عند الاعتماد والتسليم.'
          : 'Squads must activate before the cutoff and, for group awards, belong to that group at the cutoff. Accounts must be verified and unsuspended at approval and fulfillment.'}
      </p>
      <p>
        {pool.ranking === 'shared'
          ? ar
            ? 'الترتيب حسب النقاط الصافية، وتُشارك المراكز المتساوية.'
            : 'Ranked by net points with shared places for ties.'
          : ar
            ? 'الترتيب حسب النقاط الصافية، ثم أقل خصومات انتقالات، ثم أكثر أهداف محتسبة.'
            : 'Ranked by net points, then fewer transfer deductions, then more counted goals.'}
      </p>
      <p>
        {ar
          ? 'إنهاء مشاركة الفريق يستبعده من جوائز تشمل جولة موعدها بعد إنهاء المشاركة. تبقى أهليته للجوائز عن الجولات السابقة وفق هذه الشروط.'
          : 'Retiring a squad excludes it from prize windows containing a round whose deadline is after retirement. Earlier prize windows retain eligibility under these terms.'}
      </p>
      <ol>
        {pool.places.map((reward, i) => (
          <li key={i}>
            <bdi>{prizeRewardLabel(reward, pool.currency, locale)}</bdi>
          </li>
        ))}
      </ol>
    </section>
  );
}
