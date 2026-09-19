import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/brand';
import { guideGameweek } from '@/lib/help/guide-rules';
import { publicGuideCompetitions } from '@/server/guide-competitions';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';
import { SiteShell } from '../site-shell';
import { CompetitionRulesContent } from './competition-rules-content';
import { PlayerInstructions, ChipInstructions } from './player-instructions';
import { helpCopy } from '@/lib/help/topics';
import { InfoTip } from './info-tip';

export async function PlayerGuidePage({
  locale,
  kind,
  query,
}: {
  readonly locale: Locale;
  readonly kind: 'how-to-play' | 'playbook';
  readonly query: { competition?: string; gameweek?: string };
}) {
  const ar = locale === 'ar';
  const [competitions, session] = await Promise.all([
    publicGuideCompetitions(),
    currentSession(),
  ]);
  const competition = query.competition
    ? competitions.find((item) => item.slug === query.competition)
    : competitions[0];
  if (query.competition && !competition) notFound();
  const details = competition
    ? await competitionDetails(competition.slug)
    : null;
  let selected;
  try {
    selected = guideGameweek(
      details?.gameweeks ?? [],
      query.gameweek,
      Date.now(),
    );
  } catch {
    notFound();
  }
  const rules = selected?.rules ?? competition?.rules;
  const title =
    kind === 'how-to-play'
      ? ar
        ? 'إزاي تلعب'
        : 'HOW TO PLAY'
      : ar
        ? 'دليل اللعب'
        : 'YOUR PLAYBOOK';
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <h1 className="page-title">{title}</h1>
        <p className="eyebrow">
          {ar ? 'تعلّم. اختر. نافس.' : 'LEARN. CHOOSE. COMPETE.'}
        </p>
        <p className="guide-intro">
          {ar
            ? 'هذا الدليل مرتبط بإعدادات البطولة والجولة المختارتين. لا تفترض أن قواعد بطولة أخرى هي نفسها. راجع النسخة وموعد الإغلاق قبل كل جولة.'
            : 'This guide follows the selected competition and gameweek settings. Another competition may use different rules. Check the version and deadline before each round.'}
        </p>
        <form className="group-form">
          <label>
            {ar ? 'البطولة في الدليل' : 'Guide competition'}
            <select name="competition" defaultValue={competition?.slug}>
              {competitions.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="button-outline"
            disabled={!competition}
          >
            {ar ? 'تغيير البطولة' : 'CHANGE COMPETITION'}
          </button>
        </form>
        <nav
          className="guide-links"
          aria-label={ar ? 'أقسام دليل اللعب' : 'Player guide sections'}
        >
          <Link
            href={`/${locale}/${kind === 'playbook' ? 'how-to-play' : 'playbook'}${competition ? `?competition=${competition.slug}${selected ? `&gameweek=${selected.id}` : ''}` : ''}`}
          >
            {kind === 'playbook'
              ? ar
                ? 'خطوات اللعب'
                : 'Playing steps'
              : ar
                ? 'دليل اللعب الكامل'
                : 'Full playbook'}
          </Link>
          {rules && (
            <>
              <a href="#playing-steps">
                {ar ? 'خطوات اللعب' : 'Playing steps'}
              </a>
              <a href="#squad-rules">
                {ar ? 'إعدادات الفريق' : 'Squad settings'}
              </a>
              <a href="#fixture-scoring">{ar ? 'النقاط' : 'Scoring'}</a>
            </>
          )}
          {competition && (
            <Link href={`/${locale}/competitions/${competition.slug}`}>
              {ar ? 'افتح البطولة' : 'Open competition'}
            </Link>
          )}
        </nav>
      </section>
      {details && rules ? (
        <CompetitionRulesContent
          locale={locale}
          {...details}
          selected={selected}
          title={details.competition.name[locale]}
          guideRoute
        >
          <PlayerInstructions locale={locale} rules={rules} />
          {kind === 'playbook' && <ChipInstructions locale={locale} />}
        </CompetitionRulesContent>
      ) : (
        <section className="content-section">
          <h2>{ar ? 'ابدأ هنا' : 'Start here'}</h2>
          <p>
            {ar
              ? 'عند نشر بطولة ستظهر قواعدها هنا. أنشئ حسابك وفعّل بريدك ثم اختر بطولة مفتوحة للتسجيل.'
              : 'A competition’s rules appear here once it is published. Create an account, verify your email, then choose a competition open for registration.'}
          </p>
        </section>
      )}
      <section className="content-section">
        <h2>{ar ? 'ما بعد اختيار الفريق' : 'Beyond picking your squad'}</h2>
        <div className="guide-grid">
          {(
            [
              'market',
              'groups',
              'h2h',
              'results',
              'prizes',
              'achievements',
              'chat',
              'profile',
              'security',
            ] as const
          ).map((topic) => {
            const copy = helpCopy(topic, locale);
            return (
              <article className="guide-card" id={`guide-${topic}`} key={topic}>
                <h3>
                  {copy.title}{' '}
                  <InfoTip
                    locale={locale}
                    label={copy.title}
                    text={copy.text}
                  />
                </h3>
                <p>{copy.text}</p>
              </article>
            );
          })}
        </div>
        <p className="guide-context">
          {ar
            ? 'التأجيل قد ينقل مباراة غير ملعوبة إلى جولة مستقبلية قبل إغلاقها. عندها تُستخدم تشكيلة الجولة الجديدة. لا تمنح المباراة الملغاة دقائق مشاركة؛ ولا تُعامل البيانات الناقصة على أنها صفر.'
            : 'A postponed, unplayed fixture may be assigned to a future gameweek before it locks. That gameweek’s lineup then applies. A void fixture does not create played minutes, and missing data must not be treated as zero.'}
        </p>
      </section>
    </SiteShell>
  );
}
