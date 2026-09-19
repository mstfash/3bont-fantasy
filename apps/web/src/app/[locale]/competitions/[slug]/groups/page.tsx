import Link from 'next/link';
import { listLeagueGroups } from '@fantasy/application';
import { SiteShell } from '@/components/site-shell';
import { GroupCreate } from '@/components/groups/group-create';
import { GroupMembershipAction } from '@/components/groups/group-actions';
import { GroupJoin } from '@/components/groups/group-join';
import { requireLocale } from '@/lib/locale';
import { competitionDetails } from '@/server/competition';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function GroupsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; slug: string }>;
  readonly searchParams: Promise<{ page?: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale),
    ar = locale === 'ar';
  const [{ competition, gameweeks, synthetic }, session] = await Promise.all([
    competitionDetails(p.slug),
    currentSession(),
  ]);
  const db = getRuntime().db;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt((await searchParams).page ?? '1', 10) || 1),
  );
  const [groups, entryRows, memberships] = await Promise.all([
    listLeagueGroups(db, competition.id, session?.user.id ?? null, page),
    session
      ? db
          .selectFrom('entries')
          .select('data')
          .where('competition_id', '=', competition.id)
          .where('account_id', '=', session.user.id)
          .execute()
      : [],
    session
      ? db
          .selectFrom('group_memberships')
          .select(['group_id', 'status', 'entry_id'])
          .where('competition_id', '=', competition.id)
          .where('account_id', '=', session.user.id)
          .execute()
      : [],
  ]);
  const entries = entryRows
    .filter((e) => e.data.status === 'active')
    .map((e) => ({ id: e.data.id, name: e.data.name }));
  const upcoming = gameweeks.filter(
    (g) => g.status === 'upcoming' && Date.parse(g.deadline) > Date.now(),
  );
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <Link className="eyebrow" href={`/${locale}/competitions/${p.slug}`}>
          {competition.name[locale]} ↗
        </Link>
        <h1 className="page-title">
          {ar ? 'نفس الفريق. منافسة أقرب.' : 'YOUR SQUAD. YOUR RIVALS.'}
        </h1>
        <p className="hero-description">
          {ar
            ? 'نافس أصدقاءك في مجموعة خاصة أو انضم لمجموعة عامة. نقاط فريقك هي نفسها.'
            : 'Challenge friends privately or find a public group. Your existing squad supplies the points.'}
        </p>
        {synthetic && (
          <p className="synthetic-banner">
            {ar ? 'بيانات تجريبية مصطنعة' : 'SYNTHETIC DEMO DATA'}
          </p>
        )}
        <div className="group-grid">
          {groups.slice(0, 30).map(({ data: g }) => {
            const pending =
              memberships.some(
                (m) => m.group_id === g.id && m.status === 'pending',
              ) &&
              !memberships.some(
                (m) => m.group_id === g.id && m.status === 'active',
              );
            return (
              <article className="group-card" key={g.id}>
                <span className="eyebrow">
                  {g.visibility === 'public'
                    ? ar
                      ? 'عامة'
                      : 'PUBLIC'
                    : ar
                      ? 'خاصة'
                      : 'PRIVATE'}
                </span>
                <h2>{g.name}</h2>
                <p>{g.description}</p>
                {pending && g.visibility === 'private' ? (
                  <p>
                    {ar
                      ? 'طلبك ينتظر الموافقة'
                      : 'Your request awaits approval'}
                  </p>
                ) : (
                  <Link href={`/${locale}/groups/${g.id}`}>
                    {ar ? 'افتح المجموعة ↗' : 'OPEN GROUP ↗'}
                  </Link>
                )}
                {pending &&
                  memberships
                    .filter(
                      (m) => m.group_id === g.id && m.status === 'pending',
                    )
                    .map((m) => (
                      <GroupMembershipAction
                        key={m.entry_id}
                        locale={locale}
                        competitionId={competition.id}
                        groupId={g.id}
                        entryId={m.entry_id}
                        status="pending"
                        organizer={false}
                      />
                    ))}
              </article>
            );
          })}
        </div>
        {groups.length === 0 && (
          <p className="empty-state">
            {ar
              ? 'كن أول من يبدأ المنافسة هنا.'
              : 'Start the first rivalry here.'}
          </p>
        )}
        <nav
          className="group-pagination"
          aria-label={ar ? 'صفحات المجموعات' : 'Group pages'}
        >
          {page > 1 && (
            <Link href={`?page=${String(page - 1)}`}>
              {ar ? 'السابق' : 'Previous'}
            </Link>
          )}
          <span>{page}</span>
          {groups.length > 30 && (
            <Link href={`?page=${String(page + 1)}`}>
              {ar ? 'التالي' : 'Next'}
            </Link>
          )}
        </nav>
        {entries.length > 0 ? (
          <div className="group-grid">
            <section className="group-card">
              <h2>{ar ? 'معاك دعوة؟' : 'GOT AN INVITATION?'}</h2>
              <GroupJoin
                locale={locale}
                competitionId={competition.id}
                entries={entries}
              />
            </section>
            <section className="group-card">
              <h2>{ar ? 'ابدأ مجموعتك' : 'START YOUR GROUP'}</h2>
              <GroupCreate
                locale={locale}
                competitionId={competition.id}
                entryLimit={competition.entryLimit}
                entries={entries}
                gameweeks={upcoming}
              />
            </section>
          </div>
        ) : (
          <div className="empty-state">
            <p>
              {ar
                ? 'كوّن فريقاً مفعّلاً في البطولة لإنشاء المجموعات أو الانضمام إليها.'
                : 'Activate a squad in this competition to create or join groups.'}
            </p>
            <Link
              className="action-button"
              href={`/${locale}/competitions/${p.slug}/join`}
            >
              {ar ? 'كوّن فريقك' : 'BUILD YOUR SQUAD'}
            </Link>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
