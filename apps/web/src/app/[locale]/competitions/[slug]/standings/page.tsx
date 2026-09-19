import Link from 'next/link';
import { competitionStandings } from '@fantasy/application';
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
  readonly searchParams: Promise<{ page?: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  const [{ competition, synthetic }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const standings = await competitionStandings(getRuntime().db, competition);
  const requestedPage = Number((await searchParams).page ?? '1');
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
          {ar
            ? 'الترتيب العام لكل الفرق. النقاط المؤقتة قد تتغير حتى اعتماد الجولة.'
            : 'Overall standings for every squad. Provisional points can change until a gameweek is final.'}
        </p>
        {synthetic && (
          <p className="synthetic-banner">
            {ar ? 'بيانات تجريبية مصطنعة' : 'SYNTHETIC DEMO DATA'}
          </p>
        )}
        <div className="results-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th>{ar ? 'المركز' : 'Rank'}</th>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
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
                        href={`/${locale}/competitions/${p.slug}/results/${row.entryId}`}
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
            <Link href={`?page=${String(page - 1)}`}>
              {ar ? 'السابق' : 'Previous'}
            </Link>
          )}
          <span>
            {page} / {Math.max(1, Math.ceil(standings.length / 50))}
          </span>
          {page * 50 < standings.length && (
            <Link href={`?page=${String(page + 1)}`}>
              {ar ? 'التالي' : 'Next'}
            </Link>
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
