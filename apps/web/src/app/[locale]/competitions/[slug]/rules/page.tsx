import { notFound } from 'next/navigation';
import { SiteShell } from '@/components/site-shell';
import { CompetitionRulesContent } from '@/components/help/competition-rules-content';
import { requireLocale } from '@/lib/locale';
import { guideGameweek } from '@/lib/help/guide-rules';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';
export default async function CompetitionRulesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
  readonly searchParams: Promise<{ gameweek?: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale);
  const [details, session, query] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
    searchParams,
  ]);
  let selected;
  try {
    selected = guideGameweek(details.gameweeks, query.gameweek, Date.now());
  } catch {
    notFound();
  }
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <CompetitionRulesContent
        locale={locale}
        {...details}
        selected={selected}
      />
    </SiteShell>
  );
}
