import { SiteShell } from '@/components/site-shell';
import { SquadEditor } from '@/components/squad-editor';
import { requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { requireSession } from '@/server/session';
import '@/styles/squad.css';

export default async function JoinPage({
  params,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  await requireSession(locale);
  const { competition, gameweeks, players } = await competitionDetails(p.slug);
  const next = gameweeks.find(
    (g) => g.status === 'upcoming' && Date.parse(g.deadline) > Date.now(),
  );
  return (
    <SiteShell locale={locale} signedIn>
      <section className="content-section">
        <span className="eyebrow">{competition.name[locale]}</span>
        <h1 className="page-title">
          {locale === 'ar' ? 'كوّن فريقك.' : 'BUILD YOUR SQUAD.'}
        </h1>
        {next ? (
          <SquadEditor
            locale={locale}
            competition={competition}
            gameweek={next}
            players={players}
            entry={null}
          />
        ) : (
          <p>
            {locale === 'ar'
              ? 'لا توجد جولة مفتوحة للتسجيل.'
              : 'No gameweek is open for registration.'}
          </p>
        )}
      </section>
    </SiteShell>
  );
}
