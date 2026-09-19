import { WinningPitch } from '@/components/winning-pitch';
import '@/styles/home-board.css';
import {
  AccessDenied,
  readPublicLineup,
  readEntryAchievements,
} from '@fantasy/application';
import { AchievementBadges } from '@/components/achievement-badges';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import { positionNames } from '@/lib/football-labels';
import '@/styles/results.css';

const categories: Record<string, { ar: string; en: string }> = {
  appearance: { ar: 'المشاركة', en: 'Appearance' },
  goals: { ar: 'الأهداف', en: 'Goals' },
  assists: { ar: 'التمريرات الحاسمة', en: 'Assists' },
  'clean-sheet': { ar: 'الشباك النظيفة', en: 'Clean sheet' },
  conceded: { ar: 'الأهداف المستقبلة', en: 'Goals conceded' },
  discipline: { ar: 'البطاقات', en: 'Cards' },
  saves: { ar: 'التصديات', en: 'Saves' },
  'penalty-saves': { ar: 'صد ركلات الجزاء', en: 'Penalties saved' },
  'penalty-misses': { ar: 'إهدار ركلات الجزاء', en: 'Penalties missed' },
  'own-goals': { ar: 'الأهداف العكسية', en: 'Own goals' },
};
export default async function ScorePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; slug: string; entryId: string }>;
  readonly searchParams: Promise<{ gameweek?: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(p.entryId).success) notFound();
  const [{ synthetic }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const db = getRuntime().db;
  const query = await searchParams;
  if (query.gameweek && !idSchema.safeParse(query.gameweek).success) notFound();
  const publicResult = await readPublicLineup(
    db,
    p.slug,
    p.entryId,
    query.gameweek,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    throw error;
  });
  const { entry, round, lineup } = publicResult;
  const result = lineup?.result ?? null;
  const badges = await readEntryAchievements(db, p.entryId);
  const name = (id: string) =>
    lineup?.players.find((p) => p.id === id)?.name[locale] ??
    (ar ? 'لاعب' : 'Footballer');
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        {synthetic && (
          <p className="synthetic-banner">
            {ar ? 'بيانات تجريبية مصطنعة' : 'SYNTHETIC DEMO DATA'}
          </p>
        )}
        <Link
          className="eyebrow"
          href={`/${locale}/competitions/${p.slug}/standings`}
        >
          {ar ? 'الترتيب' : 'STANDINGS'} ↗ {round.name[locale]}
        </Link>
        <h1 className="page-title">{entry.name}</h1>
        <p className="hero-description">
          {ar
            ? 'تشكيلة جولة منشورة. اختيارات الجولة القادمة خاصة بصاحب الفريق.'
            : 'A published gameweek lineup. Next gameweek’s selections remain private.'}
        </p>
        {!result ? (
          <div className="empty-state">
            {ar
              ? 'في انتظار حساب نقاط الجولة.'
              : 'This gameweek’s points are being prepared.'}
          </div>
        ) : (
          <>
            <div className="result-summary">
              <strong>{(result.total / 1000).toLocaleString(locale)}</strong>
              <div>
                <span className="eyebrow">{ar ? 'نقطة' : 'POINTS'}</span>
                <p>
                  {round.status === 'finalized'
                    ? ar
                      ? 'نتيجة نهائية'
                      : 'Final result'
                    : round.status === 'review'
                      ? ar
                        ? 'نتيجة سابقة قيد المراجعة'
                        : 'Published result under review'
                      : ar
                        ? 'نتيجة مؤقتة'
                        : 'Provisional result'}
                </p>
              </div>
            </div>
            {lineup && <WinningPitch lineup={lineup} locale={locale} />}
            <div className="results-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>{ar ? 'اللاعب' : 'Footballer'}</th>
                    <th>{ar ? 'الدور' : 'Role'}</th>
                    <th>{ar ? 'الدقائق' : 'Minutes'}</th>
                    <th>{ar ? 'النقاط' : 'Points'}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.players.map((player) => (
                    <tr
                      key={player.footballerId}
                      className={
                        result.effectiveIds.includes(player.footballerId)
                          ? ''
                          : 'unused-player'
                      }
                    >
                      <td>
                        {name(player.footballerId)}
                        <small>{positionNames[player.position][locale]}</small>
                      </td>
                      <td>
                        {result.captainId === player.footballerId
                          ? ar
                            ? 'كابتن'
                            : 'Captain'
                          : result.effectiveIds.includes(player.footballerId)
                            ? ar
                              ? 'يحتسب'
                              : 'Counts'
                            : ar
                              ? 'احتياطي'
                              : 'Reserve'}
                      </td>
                      <td>{player.minutes ?? '—'}</td>
                      <td>{(player.points / 1000).toLocaleString(locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="score-ledger">
              <p>
                {ar ? 'مجموع اللاعبين' : 'Player points'}{' '}
                <strong>{result.playersTotal / 1000}</strong>
              </p>
              <p>
                {ar ? 'إضافة الكابتن' : 'Captain bonus'}{' '}
                <strong>{result.captainExtra / 1000}</strong>
              </p>
              <p>
                {ar ? 'خصم الانتقالات' : 'Transfer deductions'}{' '}
                <strong>
                  {result.transferDeduction === 0
                    ? 0
                    : `−${String(result.transferDeduction / 1000)}`}
                </strong>
              </p>
            </div>
            {result.substitutions.map((s) => (
              <p key={s.out}>
                {ar ? 'تبديل تلقائي:' : 'Automatic substitution:'} {name(s.out)}{' '}
                → {name(s.in)}
              </p>
            ))}
            <div className="section-heading">
              <h2>{ar ? 'وراء كل نقطة' : 'BEHIND EVERY POINT'}</h2>
            </div>
            {result.players.map((player) => (
              <details className="score-detail" key={player.footballerId}>
                <summary>
                  {name(player.footballerId)}{' '}
                  <strong>{player.points / 1000}</strong>
                </summary>
                {player.fixtures.length === 0 ? (
                  <p>
                    {ar
                      ? 'لا توجد نقاط مباريات متاحة بعد.'
                      : 'No fixture points are available yet.'}
                  </p>
                ) : (
                  player.fixtures.map((fixture, i) => (
                    <div key={fixture.fixtureId}>
                      <h3>
                        {ar ? 'مباراة' : 'Fixture'} {i + 1}
                      </h3>
                      {fixture.breakdown
                        .filter((b) => b.points !== 0)
                        .map((b) => (
                          <p className="breakdown-line" key={b.category}>
                            <span>
                              {categories[b.category]?.[locale] ?? b.category}
                            </span>
                            <strong>{b.points / 1000}</strong>
                          </p>
                        ))}
                    </div>
                  ))
                )}
              </details>
            ))}
            {!result.settled && (
              <p className="results-note">
                {ar
                  ? 'الشرطة تعني أن المشاركة لم تُحسم. التبديلات التلقائية وبديل الكابتن ينتظران اكتمال الجولة.'
                  : 'A dash means participation is unresolved. Automatic substitutions and vice-captain fallback wait until the whole gameweek is settled.'}
              </p>
            )}
          </>
        )}
        <AchievementBadges locale={locale} badges={badges} />
      </section>
    </SiteShell>
  );
}
