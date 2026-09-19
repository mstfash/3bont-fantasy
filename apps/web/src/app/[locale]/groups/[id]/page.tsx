import { GroupHandoverControls } from '@/components/groups/group-handover';
import { listPublishedPrizePools } from '@fantasy/application';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AccessDenied,
  CommandRejected,
  leagueGroupDetails,
} from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { EditionCreate } from '@/components/head-to-head/edition-controls';
import { GroupJoin } from '@/components/groups/group-join';
import {
  GroupInvitation,
  GroupMembershipAction,
} from '@/components/groups/group-actions';
import { requireLocale } from '@/lib/locale';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
import '@/styles/results.css';
export default async function GroupPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<{ page?: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale),
    ar = locale === 'ar';
  const id = idSchema.safeParse(p.id).data;
  if (!id) notFound();
  const session = await currentSession(),
    db = getRuntime().db;
  const details = await leagueGroupDetails(
    db,
    id,
    session?.user.id ?? null,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied || error instanceof CommandRejected)
      notFound();
    throw error;
  });
  const prizePools = await listPublishedPrizePools(
    db,
    details.group.competitionId,
    id,
  );
  const {
    group,
    competition,
    standings,
    organizer,
    ownMemberships,
    members,
    startGameweek,
  } = details;
  const entryRows = session
    ? await db
        .selectFrom('entries')
        .select('data')
        .where('competition_id', '=', competition.id)
        .where('account_id', '=', session.user.id)
        .execute()
    : [];
  const entries = entryRows
    .filter(
      (e) =>
        e.data.status === 'active' &&
        !ownMemberships.some(
          (m) =>
            m.entryId === e.data.id &&
            ['active', 'pending', 'removed'].includes(m.status),
        ),
    )
    .map((e) => ({ id: e.data.id, name: e.data.name }));
  const page = Math.max(
    1,
    Math.min(
      Math.max(1, Math.ceil(standings.length / 50)),
      Number.parseInt((await searchParams).page ?? '1', 10) || 1,
    ),
  );
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <Link
          className="eyebrow"
          href={`/${locale}/competitions/${competition.slug}/groups`}
        >
          {competition.name[locale]} / {ar ? 'المجموعات' : 'GROUPS'} ↗
        </Link>
        <h1 className="page-title">{group.name}</h1>
        <p className="hero-description">{group.description}</p>
        <p className="results-note">
          {startGameweek
            ? ar
              ? `تُحتسب النقاط من ${startGameweek.name.ar}، وتشمل نقاط تلك الفترة قبل الانضمام.`
              : `Points count from ${startGameweek.name.en}, including points in that interval earned before joining.`
            : ar
              ? 'تُحتسب النقاط من بداية البطولة، بما فيها نقاط ما قبل الانضمام.'
              : 'Points count from the start of the competition, including points earned before joining.'}{' '}
          · {ar ? 'حد الفرق لكل حساب' : 'Entries per account'}:{' '}
          {group.entryLimit}
        </p>
        {ownMemberships.some((m) => m.status === 'active') && (
          <p>
            <Link
              className="button-outline"
              href={`/${locale}/groups/${id}/chat`}
            >
              {ar ? 'غرفة المجموعة ↗' : 'Group room ↗'}
            </Link>
          </p>
        )}
        <div className="results-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th>{ar ? 'المركز' : 'Rank'}</th>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
                <th>{ar ? 'النقاط' : 'Points'}</th>
                <th>{ar ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {standings.slice((page - 1) * 50, page * 50).map((s) => (
                <tr key={s.entryId}>
                  <td className="rank-number">{s.rank}</td>
                  <td>
                    {s.scoredGameweeks > 0 ? (
                      <Link
                        href={`/${locale}/competitions/${competition.slug}/results/${s.entryId}`}
                      >
                        {s.name} ↗
                      </Link>
                    ) : (
                      s.name
                    )}
                    {s.retired && (
                      <small> · {ar ? 'انتهت المشاركة' : 'Retired'}</small>
                    )}
                  </td>
                  <td className="score-number">
                    {(s.points / 1000).toLocaleString(locale)}
                  </td>
                  <td>
                    {s.scoredGameweeks === 0
                      ? ar
                        ? 'لم تبدأ'
                        : 'Awaiting first round'
                      : s.provisional
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
        <nav
          className="group-pagination"
          aria-label={ar ? 'صفحات الترتيب' : 'Standings pages'}
        >
          {page > 1 && (
            <Link href={`?page=${String(page - 1)}`}>
              {ar ? 'السابق' : 'Previous'}
            </Link>
          )}
          <span>{page}</span>
          {page * 50 < standings.length && (
            <Link href={`?page=${String(page + 1)}`}>
              {ar ? 'التالي' : 'Next'}
            </Link>
          )}
        </nav>
        <div className="group-grid">
          <GroupHandoverControls
            locale={locale}
            group={group}
            organizer={organizer}
            offer={details.handover}
            candidates={details.handoverCandidates}
          />
          {entries.length > 0 &&
            ownMemberships.filter((m) =>
              ['active', 'pending'].includes(m.status),
            ).length < group.entryLimit && (
              <section className="group-card">
                <h2>{ar ? 'انضم للمنافسة' : 'JOIN THE RIVALRY'}</h2>
                <GroupJoin
                  locale={locale}
                  competitionId={competition.id}
                  groupId={group.id}
                  privateGroup={group.visibility === 'private' && !organizer}
                  entries={entries}
                />
              </section>
            )}
          {ownMemberships
            .filter((m) => ['active', 'pending'].includes(m.status))
            .map((m) => (
              <section className="group-card" key={m.entryId}>
                <h2>{m.name}</h2>
                <p>
                  {m.status === 'pending'
                    ? ar
                      ? 'بانتظار الموافقة'
                      : 'Awaiting approval'
                    : ar
                      ? 'عضوية فعّالة'
                      : 'Active membership'}
                </p>
                {(!organizer ||
                  ownMemberships.filter((member) => member.status === 'active')
                    .length > 1) && (
                  <GroupMembershipAction
                    locale={locale}
                    competitionId={competition.id}
                    groupId={group.id}
                    entryId={m.entryId}
                    status={m.status}
                    organizer={false}
                  />
                )}
              </section>
            ))}
          <section className="group-card">
            <h2>{ar ? 'مواجهات وجهاً لوجه' : 'HEAD TO HEAD'}</h2>
            <p>
              {ar
                ? 'كل نسخة لها قائمة فرق وجدول ثابت. التسجيل متاح قبل نشر الجدول.'
                : 'Each edition has a frozen roster and schedule. Register before its schedule is published.'}
            </p>
            <ul className="h2h-edition-list">
              {details.editions.map((e) => (
                <li key={e.id}>
                  <Link href={`/${locale}/head-to-head/${e.id}`}>
                    {e.name} ↗
                  </Link>
                </li>
              ))}
            </ul>
            {organizer && details.upcomingRounds.length > 0 && (
              <details>
                <summary>
                  {ar ? 'إنشاء نسخة مواجهات' : 'Create an H2H edition'}
                </summary>
                <EditionCreate
                  locale={locale}
                  group={group}
                  rounds={details.upcomingRounds}
                />
              </details>
            )}
          </section>
          {organizer && (
            <section className="group-card">
              <h2>{ar ? 'دعوات الأصدقاء' : 'INVITE FRIENDS'}</h2>
              <GroupInvitation locale={locale} group={group} />
            </section>
          )}
        </div>
        {organizer && (
          <section>
            <h2 className="group-section-title">
              {ar ? 'إدارة العضوية' : 'MANAGE MEMBERSHIP'}
            </h2>
            <div className="group-grid">
              {members
                .filter((m) => !m.isOrganizer)
                .map((m) => (
                  <article className="group-card" key={m.entryId}>
                    <h3>{m.name}</h3>
                    <p>
                      {m.status === 'pending'
                        ? ar
                          ? 'طلب انضمام'
                          : 'Join request'
                        : ar
                          ? 'عضو'
                          : 'Member'}
                    </p>
                    <GroupMembershipAction
                      locale={locale}
                      competitionId={competition.id}
                      groupId={group.id}
                      entryId={m.entryId}
                      status={m.status}
                      organizer
                    />
                  </article>
                ))}
            </div>
          </section>
        )}
      </section>
      {prizePools.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'جوائز المجموعة' : 'Group prizes'}</h2>
          {prizePools.map((p) => (
            <p key={p.id}>
              <Link href={`/${locale}/prizes/${p.id}`}>{p.name[locale]} ↗</Link>
            </p>
          ))}
        </section>
      )}
    </SiteShell>
  );
}
