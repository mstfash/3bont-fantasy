import Link from 'next/link';
import {
  AccessDenied,
  readCompetitionPulse,
  readPublicRoundStandings,
} from '@fantasy/application';
import { notFound } from 'next/navigation';
import { idSchema } from '@fantasy/contracts';
import { StandingsMovement } from '@/components/standings-movement';
import { InfoTip } from '@/components/help/info-tip';
import '@/styles/home-board.css';
import { SiteShell } from '@/components/site-shell';
import { requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/results.css';

export default async function StandingsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
  readonly searchParams: Promise<{ page?: string; gameweek?: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  const [{ competition, synthetic }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const query = await searchParams;
  if (query.gameweek && !idSchema.safeParse(query.gameweek).success) notFound();
  const pulse = await readCompetitionPulse(getRuntime().db, competition.slug);
  const selectedRound = query.gameweek
    ? await readPublicRoundStandings(
        getRuntime().db,
        competition.slug,
        query.gameweek,
      ).catch((error: unknown) => {
        if (error instanceof AccessDenied) notFound();
        throw error;
      })
    : null;
  const standings = selectedRound
    ? selectedRound.standings.map((r) => ({
        ...r,
        previousRank: null,
        roundPoints: r.points,
      }))
    : pulse.standings;
  const requestedPage = Number(query.page ?? '1');
  const pageLink = (n: number) =>
    '?' +
    new URLSearchParams({
      page: String(n),
      ...(query.gameweek ? { gameweek: query.gameweek } : {}),
    }).toString();
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, Math.max(1, Math.ceil(standings.length / 50)))
      : 1;
  const visible = standings.slice((page - 1) * 50, page * 50);
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <Link className="eyebrow" href={`/${locale}/competitions/${p.slug}`}>
          {competition.name[locale]} ↗
        </Link>
        <h1 className="page-title">
          {ar ? 'كل نقطة. تفرق.' : 'EVERY POINT COUNTS.'}
        </h1>
        <p className="hero-description">
          {selectedRound
            ? ar
              ? 'ترتيب الفرق في الجولة المختارة حسب النتائج المنشورة.'
              : 'Squad rankings for the selected gameweek, using published results.'
            : ar
              ? 'الترتيب العام لكل الفرق. النقاط المؤقتة قد تتغير حتى اعتماد الجولة.'
              : 'Overall standings for every squad. Provisional points can change until a gameweek is final.'}
        </p>
        {synthetic && (
          <p className="synthetic-banner">
            {ar ? 'بيانات تجريبية مصطنعة' : 'SYNTHETIC DEMO DATA'}
          </p>
        )}
        {selectedRound && (
          <p className="results-note">
            {selectedRound.round.name[locale]} ·{' '}
            <Link href={`/${locale}/competitions/${p.slug}/standings`}>
              {ar ? 'الترتيب العام' : 'Overall standings'}
            </Link>
          </p>
        )}
        {!selectedRound && (
          <p>
            <InfoTip
              locale={locale}
              label={ar ? 'حركة الترتيب' : 'Rank movement'}
              text={
                ar
                  ? 'مقارنة بنهاية الجولة السابقة باستخدام النتائج المنشورة حالياً. الجديد بلا مركز سابق.'
                  : 'Compared with the previous gameweek using currently published results. New means no earlier rank.'
              }
            />
          </p>
        )}
        <div className="results-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th>{ar ? 'المركز' : 'Rank'}</th>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
                {!selectedRound && <th>{ar ? 'الحركة' : 'Movement'}</th>}
                <th>{ar ? 'الجولات' : 'Rounds'}</th>
                <th>{ar ? 'النقاط' : 'Points'}</th>
                <th>{ar ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.entryId}>
                  <td className="rank-number">{row.rank}</td>
                  <td>
                    {row.scoredGameweeks > 0 ? (
                      <Link
                        href={`/${locale}/competitions/${p.slug}/results/${row.entryId}${selectedRound ? `?gameweek=${selectedRound.round.id}` : ''}`}
                      >
                        {row.name} ↗
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.retired && (
                      <small> · {ar ? 'انتهت المشاركة' : 'Retired'}</small>
                    )}
                  </td>
                  {!selectedRound && (
                    <td>
                      <StandingsMovement
                        rank={row.rank}
                        previousRank={row.previousRank}
                        locale={locale}
                      />
                    </td>
                  )}
                  <td>{row.scoredGameweeks}</td>
                  <td className="score-number">
                    {(row.points / 1000).toLocaleString(locale)}
                  </td>
                  <td>
                    {row.scoredGameweeks === 0
                      ? ar
                        ? 'لم تبدأ'
                        : 'Awaiting first round'
                      : row.provisional
                        ? ar
                          ? 'مؤقتة'
                          : 'Provisional'
                        : ar
                          ? 'نهائية'
                          : 'Final'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {standings.length === 0 && (
          <div className="empty-state">
            <h2>
              {ar ? 'الملعب مستني أول فريق.' : 'THE FIRST SQUAD STARTS HERE.'}
            </h2>
            <Link
              className="action-button"
              href={`/${locale}/competitions/${p.slug}/join`}
            >
              {ar ? 'كوّن فريقك' : 'BUILD YOUR SQUAD'}
            </Link>
          </div>
        )}
        <nav
          className="admin-actions"
          aria-label={ar ? 'صفحات الترتيب' : 'Standings pages'}
        >
          {page > 1 && (
            <Link href={pageLink(page - 1)}>{ar ? 'السابق' : 'Previous'}</Link>
          )}
          <span>
            {page} / {Math.max(1, Math.ceil(standings.length / 50))}
          </span>
          {page * 50 < standings.length && (
            <Link href={pageLink(page + 1)}>{ar ? 'التالي' : 'Next'}</Link>
          )}
        </nav>
        <p className="results-note">
          {competition.rules.ranking === 'shared'
            ? ar
              ? 'النقاط المتساوية تشترك في المركز: ١، ١، ٣.'
              : 'Equal points share a rank: 1, 1, 3.'
            : ar
              ? 'بعد النقاط: خصومات انتقالات أقل، ثم أهداف أكثر.'
              : 'After points: fewer transfer deductions, then more goals.'}
        </p>
      </section>
    </SiteShell>
  );
}
