import { SponsorSlot } from '@/components/sponsors/sponsor-slot';
import { getRuntime } from '@/server/runtime';
import { listPublishedPrizePools } from '@fantasy/application';
import Link from 'next/link';
import { SiteShell } from '@/components/site-shell';
import { deadlineLabel, requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';

export default async function CompetitionPage({
  params,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  const [{ competition, gameweeks, synthetic }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const prizePools = await listPublishedPrizePools(
    getRuntime().db,
    competition.id,
  );
  const next = gameweeks.find(
    (g) => g.status === 'upcoming' && Date.parse(g.deadline) > Date.now(),
  );
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        {synthetic && (
          <p className="synthetic-banner">
            {ar
              ? 'بطولة تجريبية — جميع الأندية واللاعبين والنتائج بيانات مصطنعة للاختبار.'
              : 'DEMO COMPETITION — Clubs, players and results are synthetic test data.'}
          </p>
        )}
        <span className="eyebrow">{ar ? 'البطولة' : 'THE COMPETITION'}</span>
        <h1 className="page-title">{competition.name[locale]}</h1>
        <p className="hero-description">{competition.description[locale]}</p>
        <Link
          className="button-outline"
          href={`/${locale}/competitions/${competition.slug}/achievements`}
        >
          {ar ? 'الإنجازات المتاحة ↗' : 'AVAILABLE ACHIEVEMENTS ↗'}
        </Link>
        <SponsorSlot
          locale={locale}
          slot="competition"
          competitionId={competition.id}
        />
        <div className="competition-facts">
          <div>
            <strong>{competition.rules.squad.squadSize}</strong>
            <span>{ar ? 'لاعب في الفريق' : 'PLAYERS PER SQUAD'}</span>
          </div>
          <div>
            <strong>{competition.rules.squad.startingBudget / 10}</strong>
            <span>{ar ? 'ميزانية البداية' : 'STARTING BUDGET'}</span>
          </div>
          <div>
            <strong>{competition.entryLimit}</strong>
            <span>{ar ? 'فريق لكل حساب' : 'SQUADS PER ACCOUNT'}</span>
          </div>
        </div>
        {next && (
          <div className="deadline-panel">
            <div>
              <span className="eyebrow">{next.name[locale]}</span>
              <h2>{deadlineLabel(next.deadline, locale)}</h2>
              <p>
                {ar ? 'الموعد النهائي بتوقيت القاهرة' : 'Deadline · Cairo time'}
              </p>
            </div>
            <Link
              className="action-button"
              href={`/${locale}/competitions/${competition.slug}/join`}
            >
              {ar ? 'كوّن فريقك' : 'BUILD YOUR SQUAD'}
              <span>↗</span>
            </Link>
          </div>
        )}
        <Link
          className="button-outline"
          href={`/${locale}/competitions/${competition.slug}/standings`}
        >
          {ar ? 'الترتيب العام ↗' : 'OVERALL STANDINGS ↗'}
        </Link>
        <Link
          className="text-link"
          href={`/${locale}/competitions/${competition.slug}/groups`}
        >
          {ar ? 'مجموعات الأصدقاء ↗' : 'LEAGUE GROUPS ↗'}
        </Link>
        <Link
          className="button-outline"
          href={`/${locale}/competitions/${competition.slug}/rules`}
        >
          {ar ? 'قواعد كل جولة ↗' : 'RULES BY GAMEWEEK ↗'}
        </Link>
        <div className="section-heading">
          <nav className="guide-links">
            <Link
              href={`/${locale}/how-to-play?competition=${competition.slug}`}
            >
              {ar ? 'إزاي تلعب' : 'How to play'}
            </Link>
            <Link href={`/${locale}/playbook?competition=${competition.slug}`}>
              {ar ? 'دليل اللعب' : 'Playbook'}
            </Link>
          </nav>
          <h2>{ar ? 'جدول الجولات' : 'THE GAMEWEEKS'}</h2>
        </div>
        <div className="round-list">
          {gameweeks.map((g) => (
            <div key={g.id}>
              <Link
                href={`/${locale}/competitions/${competition.slug}/rules?gameweek=${g.id}`}
              >
                <strong>{g.name[locale]}</strong> · {ar ? 'القواعد' : 'Rules'} ↗
              </Link>
              <time dateTime={g.deadline}>
                {deadlineLabel(g.deadline, locale)}
              </time>
              <span>
                {
                  {
                    upcoming: ar ? 'قادمة' : 'Upcoming',
                    locked: ar ? 'مغلقة' : 'Locked',
                    provisional: ar ? 'مؤقتة' : 'Provisional',
                    finalized: ar ? 'نهائية' : 'Final',
                    review: ar ? 'قيد المراجعة' : 'Under review',
                  }[g.status]
                }
              </span>
            </div>
          ))}
        </div>
      </section>
      {prizePools.length > 0 && (
        <section className="content-section">
          <h2>{ar ? 'جوائز البطولة' : 'Competition prizes'}</h2>
          <div className="competition-grid">
            {prizePools.map((p) => (
              <Link
                className="competition-card"
                key={p.id}
                href={`/${locale}/prizes/${p.id}`}
              >
                <h3>{p.name[locale]}</h3>
                <p>
                  {ar ? 'عرض الشروط والمراكز' : 'View terms and awarded places'}{' '}
                  ↗
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </SiteShell>
  );
}
