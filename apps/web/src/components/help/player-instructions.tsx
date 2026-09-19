import type { CompetitionRules } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { playingSteps } from '@/lib/help/guide-rules';
import { TopicHelp } from './page-help';
export function PlayerInstructions({
  locale,
  rules,
}: {
  readonly locale: Locale;
  readonly rules: CompetitionRules;
}) {
  const ar = locale === 'ar';
  return (
    <section className="guide-section" id="playing-steps">
      <h2>
        {ar
          ? 'من أول فريق إلى نهاية الجولة'
          : 'From your first squad to the final whistle'}
      </h2>
      <TopicHelp locale={locale} topic="squad" />
      <ol className="guide-steps">
        {playingSteps(rules, locale).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        {ar
          ? 'تبدأ الفرق المتأخرة بصفر نقاط من أول جولة متاحة خلال فترة التسجيل. يمكنك مقارنة فريقك في أكثر من مجموعة داخل البطولة نفسها؛ لا تحتاج فريقاً جديداً لكل مجموعة.'
          : 'Late entries start with zero points from the next eligible gameweek while registration is open. You can compare the same squad in multiple groups within the competition; each group does not require a new squad.'}
      </p>
    </section>
  );
}
export function ChipInstructions({ locale }: { readonly locale: Locale }) {
  const ar = locale === 'ar';
  const chips = [
    [
      ar ? 'وايلد كارد' : 'Wildcard',
      ar
        ? 'انتقالات بلا خصومات للجولة، مع بقاء الفريق الناتج. الإلغاء قبل الموعد يُبقي الانتقالات ويعيد حساب تكلفتها العادية.'
        : 'Transfers without deductions for the gameweek; keep the resulting squad. Cancelling before the deadline keeps the transfers and recalculates ordinary costs.',
    ],
    [
      ar ? 'فري هيت' : 'Free Hit',
      ar
        ? 'فريق مؤقت لجولة ثم استعادة الفريق الدائم من موعد الجولة السابقة، بالبنك وأسعار الشراء الأصلية. يشمل الأثر انتقالات الجولة قبل التفعيل. الإلغاء قبل الموعد يعيد حالة ما قبل التفعيل.'
        : 'A temporary squad for one gameweek, then restore the permanent squad from the previous deadline, including its bank and purchase prices. Earlier transfers in the same round also become temporary. Cancellation before the deadline restores the pre-activation state.',
    ],
    [
      ar ? 'دكة البدلاء' : 'Bench Boost',
      ar
        ? 'تُحتسب نقاط كل لاعبي الفريق في الجولة، بما فيهم البدلاء.'
        : 'All squad members score for the gameweek, including reserves.',
    ],
    [
      ar ? 'تريبل كابتن' : 'Triple Captain',
      ar
        ? 'يستخدم مضاعف الخاصية المعلن في قواعد الجولة بدلاً من مضاعف الكابتن المعتاد؛ لا تُضرب القيمتان معاً.'
        : 'Use the chip multiplier shown in the gameweek rules instead of the normal captain multiplier; the two are not multiplied together.',
    ],
  ];
  return (
    <section className="guide-section" id="chip-playbook">
      <h2>{ar ? 'استخدم الخصائص بوعي' : 'Use your chips deliberately'}</h2>
      <p>
        {ar
          ? 'القائمة أدناه تشرح الخصائص المتاحة في النظام. حالة التفعيل والرصيد والنوافذ لهذه البطولة تظهر في قواعد الجولة. وايلد كارد وفري هيت غير متاحين قبل أول موعد مؤهل للفريق.'
          : 'These descriptions explain the supported chip types. This gameweek’s rules show which are enabled, starting allowances and availability windows. Wildcard and Free Hit are unavailable before a squad’s first eligible deadline.'}
      </p>
      <div className="guide-grid">
        {chips.map(([name, text]) => (
          <article className="guide-card" key={name}>
            <h3>{name}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <p>
        {ar
          ? 'خاصية واحدة للفريق في الجولة. يحافظ وايلد كارد وفري هيت على الانتقالات المدخرة مع إضافة المخصص المعتاد للجولة التالية حتى السقف. راجع أثر الإلغاء قبل التأكيد؛ عند الموعد تُستهلك الخاصية المختارة.'
          : 'One chip per squad per gameweek. Wildcard and Free Hit preserve saved transfers and grant the next normal allowance up to the cap. Review cancellation effects before confirming; the selected chip is consumed at the deadline.'}
      </p>
    </section>
  );
}
