import type { CompetitionImpact } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';

const categories = {
  squad: { ar: 'تكوين الفريق', en: 'Squad structure' },
  ranking: { ar: 'الترتيب', en: 'Ranking' },
  transfer: { ar: 'الانتقالات', en: 'Transfers' },
  scoring: { ar: 'نقاط اللاعبين', en: 'Player scoring' },
  gameweek: { ar: 'الكابتن والبدلاء', en: 'Captaincy and substitutions' },
  enabledChips: { ar: 'الشرائح المتاحة', en: 'Enabled chips' },
  chipInventory: { ar: 'رصيد الشرائح', en: 'Chip allowances' },
  chipWindows: { ar: 'فترات الشرائح', en: 'Chip windows' },
  deadlineOffsetMinutes: { ar: 'فارق موعد الإغلاق', en: 'Deadline offset' },
  correctionWindowHours: { ar: 'فترة التصحيح', en: 'Correction window' },
  pricing: { ar: 'سياسة الأسعار', en: 'Pricing policy' },
};
const metadata = {
  name: { ar: 'الاسم', en: 'Name' },
  description: { ar: 'الوصف', en: 'Description' },
  entryLimit: { ar: 'حد الفرق للحساب', en: 'Entry limit' },
  registrationOpens: { ar: 'بداية التسجيل', en: 'Registration opens' },
  registrationCloses: { ar: 'نهاية التسجيل', en: 'Registration closes' },
};
const dispositions = {
  updated: { ar: 'تحديث القواعد', en: 'Rules updated' },
  locked: { ar: 'محفوظة — أُغلقت الجولة', en: 'Preserved — locked' },
  notice: {
    ar: 'محفوظة — أقل من ٤٨ ساعة للإخطار',
    en: 'Preserved — less than 48 hours notice',
  },
  unchanged: { ar: 'دون تغيير', en: 'Unchanged' },
};
export function CompetitionImpactReview({
  impact,
  locale,
}: {
  readonly impact: CompetitionImpact;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  const number = (value: number) =>
    new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB', {
      numberingSystem: ar ? 'arab' : 'latn',
    }).format(value);
  const changed = impact.rounds.filter(
    (r) => r.disposition === 'updated',
  ).length;
  return (
    <section aria-label={ar ? 'أثر تغيير الإعدادات' : 'Configuration impact'}>
      <h3>{ar ? 'أثر تغيير الإعدادات' : 'Configuration impact'}</h3>
      <p>
        {ar
          ? 'بيانات البطولة التي ستتغير فور التأكيد: '
          : 'Competition details changed immediately on confirmation: '}
        {impact.metadataChanges
          .map((k) => metadata[k][locale])
          .join(ar ? '، ' : ', ') || (ar ? 'لا شيء' : 'None')}
        .
      </p>
      <p>
        {ar ? 'القواعد المطلوبة: ' : 'Requested rule changes: '}
        {impact.changedCategories
          .map((k) => categories[k][locale])
          .join(ar ? '، ' : ', ') || (ar ? 'لا شيء' : 'None')}
        .
      </p>
      <p>
        {ar
          ? `${number(changed)} جولة ستتلقى تحديثًا؛ ${number(impact.rounds.length - changed)} جولة ستحتفظ بقواعدها الحالية.`
          : `${number(changed)} gameweeks receive an update; ${number(impact.rounds.length - changed)} keep their current rules.`}
      </p>
      <p>
        {ar
          ? `${number(impact.entries.accounts)} حساب — ${number(impact.entries.active)} فريق نشط، ${number(impact.entries.draft)} مسودة، ${number(impact.entries.retired)} منسحب. حد الفرق للحساب: ${number(impact.entryLimit.before)} ← ${number(impact.entryLimit.after)}. أكبر عدد موجود للحساب: ${number(impact.entries.maximumOwned)}.`
          : `${number(impact.entries.accounts)} accounts — ${number(impact.entries.active)} active entries, ${number(impact.entries.draft)} drafts, ${number(impact.entries.retired)} retired. Entries per account: ${number(impact.entryLimit.before)} → ${number(impact.entryLimit.after)}. Largest existing count: ${number(impact.entries.maximumOwned)}.`}
      </p>
      {impact.economicStart !== null && (
        <p>
          {ar
            ? `قواعد الانتقالات وتفعيل الشرائح تبدأ من الجولة ${number(impact.economicStart)}.`
            : `Transfer and chip availability changes start in gameweek ${number(impact.economicStart)}.`}
        </p>
      )}
      {impact.changedCategories.includes('transfer') && (
        <p>
          {ar
            ? `${number(impact.entries.activeAboveProposedCarryCap)} فريق نشط لديه حاليًا رصيد انتقالات مجانية يتجاوز الحد المقترح. لا يُخصم الرصيد الآن؛ تُطبق قواعد الجولة الجديدة عند الانتقال إليها. الرصيد المستقبلي يعتمد على اختيارات المشاركين.`
            : `${number(impact.entries.activeAboveProposedCarryCap)} active entries currently hold more free transfers than the proposed cap. No balance is reduced now; the new round’s rules apply when entries advance into it. Future balances depend on participant actions.`}
        </p>
      )}
      {impact.changedCategories.includes('deadlineOffsetMinutes') && (
        <p>
          {ar
            ? 'الفارق الجديد يغيّر اقتراح المواعيد فقط؛ المواعيد المحفوظة أدناه لا تتحرك.'
            : 'The new offset changes deadline suggestions; the saved deadlines below do not move.'}
        </p>
      )}
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{ar ? 'الجولة' : 'Gameweek'}</th>
              <th>{ar ? 'الإغلاق بتوقيت القاهرة' : 'Deadline · Cairo'}</th>
              <th>{ar ? 'نسخة القواعد' : 'Rule version'}</th>
              <th>{ar ? 'الأثر' : 'Effect'}</th>
            </tr>
          </thead>
          <tbody>
            {impact.rounds.map((round) => (
              <tr key={round.id}>
                <td>
                  {round.number} · {round.name[locale]}
                </td>
                <td>{deadlineLabel(round.deadline, locale)}</td>
                <td>
                  <bdi>
                    {round.beforeVersion} → {round.afterVersion}
                  </bdi>
                </td>
                <td>
                  {dispositions[round.disposition][locale]}
                  {round.changedCategories.length > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      {round.changedCategories
                        .map((k) => categories[k][locale])
                        .join(ar ? '، ' : ', ')}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {impact.rounds.length === 0 && (
        <p>
          {ar
            ? 'لم تُنشأ جولات بعد؛ ستستخدم الجولات الجديدة القواعد المحفوظة.'
            : 'No gameweeks exist yet; new gameweeks will use the saved rules.'}
        </p>
      )}
      <p>
        {ar
          ? 'يُعاد التحقق عند التأكيد. إذا تغير الأثر، راجع المعاينة من جديد.'
          : 'The impact is checked again on confirmation. If it has changed, review a fresh preview.'}
      </p>
    </section>
  );
}
