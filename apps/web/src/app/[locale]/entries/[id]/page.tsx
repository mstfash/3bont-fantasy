import { notFound } from 'next/navigation';
import Link from 'next/link';
import { EntryLifecycleControls } from '@/components/entry-lifecycle-controls';
import { entrySchema, idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { SquadEditor } from '@/components/squad-editor';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { requireSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/squad.css';

export default async function EntryPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const session = await requireSession(locale);
  if (!idSchema.safeParse(p.id).success) notFound();
  const row = await getRuntime()
    .db.selectFrom('entries')
    .innerJoin('competitions', 'competitions.id', 'entries.competition_id')
    .select(['entries.data as entry', 'competitions.slug'])
    .where('entries.id', '=', p.id)
    .where('entries.account_id', '=', session.user.id)
    .executeTakeFirst();
  if (!row) notFound();
  const entry = entrySchema.parse(row.entry);
  const { competition, gameweeks, players } = await competitionDetails(
    row.slug,
  );
  const gameweek = gameweeks.find((g) => g.id === entry.editingGameweekId);
  const retirement =
    entry.status === 'retired'
      ? await getRuntime()
          .db.selectFrom('entry_retirements')
          .select('retired_at')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst()
      : undefined;
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <span className="eyebrow">{competition.name[locale]}</span>
        <h1 className="page-title">{entry.name}</h1>
        {entry.status === 'retired' ? (
          <div className="empty-state">
            <h2>{locale === 'ar' ? 'انتهت مشاركة الفريق' : 'SQUAD RETIRED'}</h2>
            <p>
              {locale === 'ar'
                ? 'توقفت المشاركة في الجولات القادمة. سجلّ الفريق ونقاطه محفوظان.'
                : 'This squad has stopped entering future rounds. Its history and points are preserved.'}
            </p>
            {retirement && (
              <p>
                {deadlineLabel(retirement.retired_at.toISOString(), locale)}
              </p>
            )}
            <Link
              className="button-outline"
              href={`/${locale}/competitions/${row.slug}/standings`}
            >
              {locale === 'ar'
                ? 'عرض ترتيب البطولة'
                : 'View competition standings'}
            </Link>
          </div>
        ) : gameweek ? (
          <SquadEditor
            locale={locale}
            competition={competition}
            gameweek={gameweek}
            players={players}
            entry={entry}
          />
        ) : (
          <p>
            {locale === 'ar'
              ? 'لا توجد جولة متاحة.'
              : 'No gameweek is available.'}
          </p>
        )}
        <EntryLifecycleControls
          key={entry.revision}
          entry={entry}
          locale={locale}
        />
      </section>
    </SiteShell>
  );
}
