import Link from 'next/link';
import { readAchievementCatalogue } from '@fantasy/application';
import type { AchievementDefinition } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { achievementIcons } from '@/components/achievement-badges';
import { requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { getRuntime } from '@/server/runtime';
import { currentSession } from '@/server/session';
import '@/styles/groups.css';
function conditionLabel(
  definition: AchievementDefinition,
  ar: boolean,
): string {
  const condition = definition.condition;
  if (condition.kind === 'activated')
    return ar
      ? 'تفعيل فريق مؤهل ضمن النافذة.'
      : 'Activate an eligible squad within the window.';
  if (condition.kind === 'positive-round')
    return ar
      ? 'أول جولة نهائية بنقاط صافية موجبة.'
      : 'Your first final gameweek with positive net points.';
  if (condition.kind === 'points')
    return ar
      ? `تحقيق ${String(condition.minimum / 1000)} نقطة صافية على الأقل في جولة نهائية.`
      : `Reach at least ${String(condition.minimum / 1000)} net points in a final gameweek.`;
  if (condition.kind === 'top-rank')
    return ar
      ? `إنهاء جولة نهائية ضمن أفضل ${String(condition.maximumRank)} مراكز، مع احترام التعادل.`
      : `Finish a final gameweek within the top ${String(condition.maximumRank)} places, respecting shared ranks.`;
  return ar
    ? `${String(condition.length)} جولات نهائية متتالية، بنقاط صافية لا تقل عن ${String(condition.minimum / 1000)} في كل جولة.`
    : `${String(condition.length)} consecutive final gameweeks, each with at least ${String(condition.minimum / 1000)} net points.`;
}
export default async function AchievementCatalogue({
  params,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar';
  const [{ competition }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const definitions = await readAchievementCatalogue(
    getRuntime().db,
    competition.id,
  );
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <Link href={`/${locale}/competitions/${competition.slug}`}>
          {competition.name[locale]}
        </Link>
        <h1 className="page-title">
          {ar ? 'إنجازات تستحقها.' : 'BADGES WORTH EARNING.'}
        </h1>
        <p className="hero-description">
          {ar
            ? 'إنجازات للذكرى. لا تغيّر النقاط أو الميزانية أو أهلية الجوائز، وتُراجع إذا تغيّرت النتائج النهائية.'
            : 'Recognition for your season. Badges do not change points, budgets or prize eligibility and are reconciled when final results change.'}
        </p>
        {definitions.length === 0 && (
          <p>
            {ar
              ? 'لم تُنشر إنجازات لهذه البطولة بعد.'
              : 'No achievements have been published for this competition yet.'}
          </p>
        )}
        <div className="group-grid">
          {definitions.map((d) => {
            const Icon = achievementIcons[d.icon];
            return (
              <article
                className="group-card"
                key={`${d.id}:${String(d.version)}`}
              >
                <Icon aria-hidden size={36} />
                <h2>{d.name[locale]}</h2>
                <p>{d.description[locale]}</p>
                <p>{conditionLabel(d, ar)}</p>
                <p>
                  {ar ? 'الجولات المؤهلة' : 'Eligible rounds'} {d.firstRound}–
                  {Math.min(d.lastRound, d.activeUntilRound)} ·{' '}
                  {d.scope === 'account'
                    ? ar
                      ? 'مرة لكل حساب'
                      : 'Once per account'
                    : ar
                      ? 'مرة لكل فريق'
                      : 'Once per squad'}{' '}
                  · v{d.version}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
