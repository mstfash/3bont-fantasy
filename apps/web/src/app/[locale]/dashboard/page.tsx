import { readAccountAchievements } from '@fantasy/application';
import { AchievementBadges } from '@/components/achievement-badges';
import Link from 'next/link';
import { competitionSchema, entrySchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { requireLocale } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import { requireSession } from '@/server/session';

export default async function Dashboard({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const session = await requireSession(locale);
  const rows = await getRuntime()
    .db.selectFrom('entries')
    .innerJoin('competitions', 'competitions.id', 'entries.competition_id')
    .select(['entries.data as entry', 'competitions.data as competition'])
    .where('entries.account_id', '=', session.user.id)
    .execute();
  const badges = await readAccountAchievements(
    getRuntime().db,
    session.user.id,
  );
  const entries = rows.map((row) => ({
    entry: entrySchema.parse(row.entry),
    competition: competitionSchema.parse(row.competition),
  }));
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <span className="eyebrow">
          {ar
            ? `أهلاً ${session.user.name}`
            : `WELCOME, ${session.user.name.toUpperCase()}`}
        </span>
        <div className="section-heading">
          <h1 className="page-title">
            {ar ? 'القرار ليك.' : 'YOUR NEXT MOVE.'}
          </h1>
        </div>
        {entries.length === 0 ? (
          <div className="empty-state">
            <h2>
              {ar ? 'فريقك الأول مستنيك.' : 'YOUR FIRST SQUAD IS WAITING.'}
            </h2>
            <p>
              {ar
                ? 'اختر بطولة مفتوحة لبدء تشكيل فريقك.'
                : 'Choose an open competition to start building your squad.'}
            </p>
            <Link className="action-button" href={`/${locale}#competitions`}>
              {ar ? 'استكشف البطولات' : 'EXPLORE COMPETITIONS'}
              <span>↗</span>
            </Link>
          </div>
        ) : (
          <div className="competition-grid">
            {entries.map(({ entry, competition }) => (
              <Link
                key={entry.id}
                className="competition-card"
                href={`/${locale}/entries/${entry.id}`}
              >
                <span className="eyebrow">{competition.name[locale]}</span>
                <h2>{entry.name}</h2>
                {entry.status === 'retired' && (
                  <p>{ar ? 'انتهت المشاركة' : 'Retired'}</p>
                )}
                <p>
                  {ar ? 'رصيد الميزانية' : 'Bank'}:{' '}
                  {(entry.state.roster.bank / 10).toFixed(1)}
                </p>
                <span className="card-arrow">↗</span>
              </Link>
            ))}
          </div>
        )}
        <AchievementBadges locale={locale} badges={badges} />
      </section>
    </SiteShell>
  );
}
