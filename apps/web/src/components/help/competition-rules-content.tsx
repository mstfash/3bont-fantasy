import Link from 'next/link';
import type { ReactNode } from 'react';
import { CHIPS, POSITIONS } from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import { positionNames } from '@/lib/football-labels';
import type { competitionDetails } from '@/server/competition';
import type { Gameweek } from '@fantasy/contracts';
import { competitionFacts } from '@/lib/help/guide-rules';
import '@/styles/groups.css';
import '@/styles/results.css';
type Details = Awaited<ReturnType<typeof competitionDetails>>;
export function CompetitionRulesContent({
  locale,
  competition,
  gameweeks,
  chipGrants,
  selected,
  title,
  guideRoute = false,
  children,
}: {
  readonly locale: Locale;
  readonly competition: Details['competition'];
  readonly gameweeks: Details['gameweeks'];
  readonly chipGrants: Details['chipGrants'];
  readonly selected: Gameweek | undefined;
  readonly title?: string;
  readonly guideRoute?: boolean;
  readonly children?: ReactNode;
}) {
  const ar = locale === 'ar';
  const Heading = guideRoute ? 'h2' : 'h1';
  const rules = selected?.rules ?? competition.rules;
  const points = (value: number) => (value / 1000).toLocaleString(locale);
  const chipNames = {
    wildcard: ar ? 'وايلد كارد' : 'Wildcard',
    'free-hit': ar ? 'فري هيت' : 'Free Hit',
    'bench-boost': ar ? 'دكة البدلاء' : 'Bench Boost',
    'triple-captain': ar ? 'تريبل كابتن' : 'Triple Captain',
  };
  const rows = [
    [
      ar ? 'ظهور أقل من حد الدقائق' : 'Appearance below minutes threshold',
      points(rules.scoring.appearance.short),
    ],
    [
      ar ? 'ظهور عند الحد أو أكثر' : 'Appearance at/above minutes threshold',
      points(rules.scoring.appearance.full),
    ],
    [
      ar ? 'حد دقائق الظهور' : 'Appearance minutes threshold',
      String(rules.scoring.appearance.thresholdMinutes),
    ],
    [ar ? 'تمريرة حاسمة' : 'Assist', points(rules.scoring.assist)],
    [ar ? 'بطاقة صفراء' : 'Yellow card', points(rules.scoring.yellow)],
    [ar ? 'طرد مباشر' : 'Straight red', points(rules.scoring.straightRed)],
    [
      ar
        ? 'الطرد بإنذار ثانٍ — مجموع الخصم'
        : 'Second-yellow dismissal — total deduction',
      points(rules.scoring.secondYellowDismissal),
    ],
    [
      ar ? 'تصدي لركلة جزاء' : 'Penalty save',
      points(rules.scoring.penaltySave),
    ],
    [
      ar ? 'ركلة جزاء مهدرة' : 'Penalty miss',
      points(rules.scoring.penaltyMiss),
    ],
    [ar ? 'هدف عكسي' : 'Own goal', points(rules.scoring.ownGoal)],
    [
      ar ? 'تصديات الحارس' : 'Goalkeeper saves',
      `${points(rules.scoring.saves.award)} / ${String(rules.scoring.saves.perSaves)}`,
    ],
  ];
  return (
    <section className="content-section">
      <Link
        className="eyebrow"
        href={`/${locale}/competitions/${competition.slug}`}
      >
        {competition.name[locale]} ↗
      </Link>
      <Heading className="page-title">
        {title ?? (ar ? 'القواعد واضحة.' : 'KNOW YOUR GAME.')}
      </Heading>
      <form className="group-form h2h-round-selector">
        {guideRoute && (
          <input type="hidden" name="competition" value={competition.slug} />
        )}
        <label>
          {ar ? 'قواعد الجولة' : 'Gameweek rules'}
          <select
            name="gameweek"
            defaultValue={selected?.id}
            aria-label={ar ? 'قواعد الجولة' : 'Gameweek rules'}
          >
            {gameweeks.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name[locale]} · {ar ? 'نسخة' : 'Version'} {g.rules.version}
              </option>
            ))}
          </select>
        </label>
        <button className="button-outline" type="submit">
          {ar ? 'عرض القواعد' : 'SHOW RULES'}
        </button>
      </form>
      <p className="results-note">
        {selected?.name[locale]} · {ar ? 'نسخة' : 'Version'} {rules.version}
        {selected && ` · ${deadlineLabel(selected.deadline, locale)}`}
      </p>
      <p className="hero-description">
        {ar
          ? 'كل جولة تحتفظ بقواعدها بعد الإغلاق. راجع الجولات القادمة لمعرفة التغييرات المعلنة.'
          : 'Each gameweek keeps its rules after locking. Check future rounds for announced changes.'}
      </p>
      {children}
      {chipGrants.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'منح الشرائح المعلنة' : 'ANNOUNCED CHIP GRANTS'}</h2>
          {chipGrants.map((grant) => (
            <article key={grant.id}>
              <h3>
                {gameweeks.find((g) => g.id === grant.gameweekId)?.name[locale]}
              </h3>
              <p>{grant.announcement[locale]}</p>
              <p>
                {CHIPS.filter((c) => grant.amounts[c] > 0)
                  .map((c) => `${chipNames[c]} +${String(grant.amounts[c])}`)
                  .join(' · ')}
              </p>
            </article>
          ))}
        </section>
      )}
      <div className="guide-context">
        {ar ? 'فترة التسجيل الحالية' : 'Current registration window'}:{' '}
        {deadlineLabel(competition.registrationOpens, locale)} —{' '}
        {deadlineLabel(competition.registrationCloses, locale)}
      </div>
      <div className="guide-grid">
        {competitionFacts(competition, rules, locale).map(([label, value]) => (
          <article className="guide-card" key={label}>
            <h3>{label}</h3>
            <p>{value}</p>
          </article>
        ))}
      </div>
      <div className="group-grid">
        <article className="group-card" id="squad-rules">
          <h2>{ar ? 'الفريق والتشكيل' : 'SQUAD & LINEUP'}</h2>
          <p>
            {ar ? 'حجم الفريق' : 'Squad size'}: {rules.squad.squadSize} ·{' '}
            {ar ? 'أساسي' : 'Starters'}: {rules.squad.starterCount}
          </p>
          <p>
            {ar ? 'ميزانية البداية' : 'Starting budget'}:{' '}
            {(rules.squad.startingBudget / 10).toFixed(1)} ·{' '}
            {ar ? 'حد النادي' : 'Club cap'}: {rules.squad.clubCap}
          </p>
          <ul>
            {POSITIONS.map((position) => (
              <li key={position}>
                {positionNames[position][locale]}:{' '}
                {rules.squad.quotas[position]}
              </li>
            ))}
          </ul>
          <p>
            {ar ? 'التشكيلات المسموحة' : 'Permitted formations'}:{' '}
            {rules.squad.formations
              .map((f) => `${String(f.DEF)}–${String(f.MID)}–${String(f.FWD)}`)
              .join(' / ')}
          </p>
        </article>
        <article className="group-card">
          <h2>{ar ? 'الانتقالات' : 'TRANSFERS'}</h2>
          <p>
            {ar ? 'مجانية لكل جولة' : 'Free per gameweek'}:{' '}
            {rules.transfer.allowance} · {ar ? 'حد الادخار' : 'Carry cap'}:{' '}
            {rules.transfer.carryCap}
          </p>
          <p>
            {ar ? 'خصم كل انتقال إضافي' : 'Deduction per extra transfer'}:{' '}
            {points(rules.transfer.extraTransferCost)}
          </p>
          <p>
            {rules.transfer.sellingPolicy === 'half-gain-full-loss'
              ? ar
                ? 'البيع: نصف الربح مقرباً لأسفل إلى ٠٫١، وكامل الخسارة.'
                : 'Selling: half the gain rounded down to 0.1, and full losses.'
              : ar
                ? 'البيع بالسعر الخيالي الحالي.'
                : 'Sell at the current fantasy price.'}
          </p>
          <p>
            {ar
              ? 'تكوين الفريق بلا خصومات انتقالات قبل أول موعد أهلية له. الوايلد كارد والفري هيت يحافظان على الانتقالات المدخرة.'
              : 'Squad building has no transfer deductions before its first eligible deadline. Wildcard and Free Hit preserve saved free transfers.'}
          </p>
        </article>
        <article className="group-card">
          <h2>{ar ? 'الكابتن والبدلاء' : 'CAPTAIN & RESERVES'}</h2>
          <p>
            {!rules.squad.captaincyEnabled && (
              <strong>
                {ar ? 'الكابتن غير مفعّل. ' : 'Captaincy is disabled. '}
              </strong>
            )}
            {ar ? 'مضاعف الكابتن' : 'Captain multiplier'}: ×
            {rules.gameweek.captainMultiplier} ·{' '}
            {ar ? 'تريبل كابتن' : 'Triple Captain'}: ×
            {rules.gameweek.tripleCaptainMultiplier}
          </p>
          <p>
            {ar ? 'البدائل التلقائية' : 'Automatic substitutions'}:{' '}
            {rules.gameweek.automaticSubstitutions
              ? ar
                ? 'مفعّلة'
                : 'Enabled'
              : ar
                ? 'غير مفعّلة'
                : 'Disabled'}
          </p>
          <p>
            {ar
              ? 'عند تفعيل الكابتنية، يستلم النائب المضاعف فقط إذا شارك وتأكدت صفر دقائق للكابتن طوال الجولة. النقاط السالبة تُضاعف أيضاً.'
              : 'When captaincy is enabled, a vice-captain who played takes the multiplier only when the captain has confirmed zero minutes across the entire round. Negative points multiply too.'}
          </p>
        </article>
        <article className="group-card">
          <h2>{ar ? 'الشرائح' : 'CHIPS'}</h2>
          <p>
            {ar
              ? 'شريحة واحدة لكل فريق في الجولة. مخزون الفرق مستقل.'
              : 'One chip per squad per gameweek. Each squad has its own inventory.'}
          </p>
          <ul>
            {CHIPS.map((chip) => (
              <li key={chip}>
                {chipNames[chip]}:{' '}
                {rules.enabledChips.includes(chip)
                  ? `${String(rules.chipInventory[chip])} ${ar ? 'عند إنشاء الفريق' : 'on entry creation'}`
                  : ar
                    ? 'غير مفعّلة'
                    : 'Disabled'}
                {rules.chipWindows
                  .filter((w) => w.chip === chip)
                  .map((w) => (
                    <span
                      key={`${String(w.firstRound)}:${String(w.lastRound)}`}
                    >
                      {' '}
                      · {ar ? 'الجولات' : 'Rounds'} {w.firstRound}–{w.lastRound}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
          <p>
            {ar
              ? 'راجع رصيد فريقك الفعلي قبل اختيار الشريحة.'
              : 'Check your squad’s remaining inventory before choosing a chip.'}
          </p>
        </article>
      </div>
      <h2 className="group-section-title" id="fixture-scoring">
        {ar ? 'نقاط كل مباراة' : 'POINTS PER FIXTURE'}
      </h2>
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>{ar ? 'المركز' : 'Position'}</th>
              <th>{ar ? 'هدف' : 'Goal'}</th>
              <th>{ar ? 'شباك نظيفة' : 'Clean sheet'}</th>
              <th>{ar ? 'خصم الاستقبال' : 'Conceded-goal adjustment'}</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((position) => (
              <tr key={position}>
                <td>{positionNames[position][locale]}</td>
                <td>{points(rules.scoring.goal[position])}</td>
                <td>{points(rules.scoring.cleanSheet.award[position])}</td>
                <td>
                  {points(rules.scoring.conceded.award[position])} /{' '}
                  {rules.scoring.conceded.perGoals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="results-note">
        {ar ? 'تتطلب الشباك النظيفة' : 'Clean sheets require'}{' '}
        {rules.scoring.cleanSheet.thresholdMinutes}{' '}
        {ar
          ? 'دقيقة، وألا يستقبل اللاعب هدفاً أثناء وجوده بالملعب. الطرد يمنع مكافأة الشباك النظيفة، وتُحتسب أهداف ما بعده.'
          : 'minutes and no goal conceded while on the pitch. Sending off removes the clean-sheet award; goals conceded afterward still count.'}
      </p>
      <div className="results-scroll">
        <table className="results-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="results-note">
        {ar
          ? 'ركلات الترجيح مستبعدة. صد ركلة الجزاء يُضاف إلى مجموع التصديات. الطرد المباشر بعد إنذار يجمع الخصمين. المكافآت الإضافية غير مفعّلة.'
          : 'Shootouts are excluded. A saved penalty also counts toward total saves. A separate straight red after a yellow adds both deductions. Bonus scoring is disabled.'}
      </p>
      <p className="results-note">
        {ar ? 'نافذة تصحيح النتائج' : 'Result correction window'}:{' '}
        {rules.correctionWindowHours}{' '}
        {ar
          ? 'ساعة بعد اكتمال البيانات واستقرار المباريات.'
          : 'hours after complete data and settled fixtures.'}
      </p>
    </section>
  );
}
