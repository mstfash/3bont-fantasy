import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AccessDenied,
  CommandRejected,
  headToHeadDetails,
} from '@fantasy/application';
import { scheduleHeadToHead } from '@fantasy/domain';
import { idSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { EditionControl } from '@/components/head-to-head/edition-controls';
import { requireLocale } from '@/lib/locale';
import { currentSession } from '@/server/session';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
import '@/styles/results.css';
export default async function EditionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<{ round?: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar';
  const id = idSchema.safeParse(p.id).data;
  if (!id) notFound();
  const session = await currentSession();
  const view = await headToHeadDetails(
    getRuntime().db,
    id,
    session?.user.id ?? null,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied || error instanceof CommandRejected)
      notFound();
    throw error;
  });
  const { edition, group, organizer, roster, table, rounds, matches, phase } =
    view;
  const names = new Map(roster.map((e) => [e.id, e.name]));
  const preview =
    edition.status === 'registration' && roster.length >= 2
      ? scheduleHeadToHead(
          roster.map((e) => e.id),
          edition.gameweekIds,
          edition.seed,
        )
      : [];
  const previewRounds = new Set(preview.map((f) => f.gameweekId));
  const requested = (await searchParams).round;
  const round =
    rounds.find((r) => r.id === requested) ??
    rounds.find((r) => r.status === 'upcoming') ??
    rounds.at(-1);
  const phaseLabels = {
    draft: ar ? 'مسودة' : 'DRAFT',
    registration: ar ? 'التسجيل مفتوح' : 'REGISTRATION OPEN',
    scheduled: ar ? 'الجدول منشور' : 'SCHEDULE PUBLISHED',
    active: ar ? 'جارية — النتائج قد تتغير' : 'ACTIVE — RESULTS CAN CHANGE',
    review: ar ? 'مراجعة تصحيح النتائج' : 'RESULT CORRECTION REVIEW',
    settled: ar ? 'مكتملة' : 'SETTLED',
  };
  const owned = roster.filter((e) => e.owned && !e.withdrawn);
  const beforeDeadline = rounds.every(
    (r) => r.status === 'upcoming' && Date.parse(r.deadline) > Date.now(),
  );
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="content-section">
        <Link className="eyebrow" href={`/${locale}/groups/${group.id}`}>
          {group.name} ↗
        </Link>
        <h1 className="page-title">{edition.name}</h1>
        <p className="eyebrow">{phaseLabels[phase]}</p>
        <p className="hero-description">
          {ar
            ? 'نقاط الفريق الصافية، بعد خصومات الانتقالات، تحدد كل مواجهة.'
            : 'Net squad points, including transfer deductions, decide each matchup.'}
        </p>
        <p className="results-note">
          {ar ? 'فوز / تعادل / خسارة' : 'Win / draw / loss'}:{' '}
          {edition.tablePoints.win} / {edition.tablePoints.draw} /{' '}
          {edition.tablePoints.loss}.{' '}
          {ar
            ? 'الراحة والانسحاب المزدوج: صفر.'
            : 'Byes and double forfeits: zero.'}{' '}
          {edition.tieBreak === 'shared'
            ? ar
              ? 'التساوي يمنح مركزاً مشتركاً.'
              : 'Equal table points share rank.'
            : ar
              ? 'عند التساوي: مجموع نقاط الفانتازي ثم مركز مشترك.'
              : 'Tie break: net fantasy points, then shared rank.'}
        </p>
        <div className="group-grid">
          {organizer && edition.status === 'draft' && beforeDeadline && (
            <section className="group-card">
              <h2>{ar ? 'افتح المنافسة' : 'OPEN THE CONTEST'}</h2>
              <EditionControl
                locale={locale}
                edition={edition}
                kind="open-registration"
              />
            </section>
          )}
          {edition.status === 'registration' &&
            beforeDeadline &&
            view.eligibleEntries.length > 0 && (
              <section className="group-card">
                <h2>{ar ? 'سجل فريقك' : 'ENTER YOUR SQUAD'}</h2>
                <EditionControl
                  locale={locale}
                  edition={edition}
                  kind="register"
                  entries={view.eligibleEntries}
                />
              </section>
            )}
          {owned.length > 0 && phase !== 'settled' && (
            <section className="group-card">
              <h2>{ar ? 'إدارة المشاركة' : 'YOUR PARTICIPATION'}</h2>
              <EditionControl
                locale={locale}
                edition={edition}
                kind="withdraw"
                entries={owned}
              />
            </section>
          )}
        </div>
        {edition.status !== 'published' && (
          <section className="group-card">
            <h2>
              {ar ? 'الفرق المسجلة' : 'REGISTERED SQUADS'} ({roster.length})
            </h2>
            <ul>
              {roster.map((e) => (
                <li key={e.id}>{e.name}</li>
              ))}
            </ul>
            {!beforeDeadline && (
              <p role="status">
                {ar
                  ? 'انتهى أحد مواعيد الجولات. أنشئ نسخة جديدة بمواعيد قادمة.'
                  : 'A selected deadline has passed. Create a new edition using future rounds.'}
              </p>
            )}
          </section>
        )}
        {organizer && edition.status === 'registration' && (
          <section className="group-card">
            <h2>
              {ar ? 'راجع الجدول قبل تثبيته' : 'REVIEW THE FIXED SCHEDULE'}
            </h2>
            <p>
              {ar
                ? `يتسع الجدول لـ ${String(previewRounds.size)} جولة من ${String(rounds.length)} جولة محددة. الجولات الباقية لا تدخل هذه النسخة.`
                : `The schedule uses ${String(previewRounds.size)} of ${String(rounds.length)} selected rounds. Remaining rounds are excluded from this edition.`}
            </p>
            {preview.length === 0 ? (
              <p>
                {ar
                  ? 'يلزم فريقان على الأقل ومساحة لدورة كاملة.'
                  : 'At least two squads and room for a complete cycle are required.'}
              </p>
            ) : (
              <>
                <form className="group-form h2h-round-selector">
                  <label>
                    {ar ? 'معاينة الجولة' : 'Preview gameweek'}
                    <select name="round" defaultValue={round?.id}>
                      {rounds
                        .filter((r) => previewRounds.has(r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name[locale]}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="button-outline" type="submit">
                    {ar ? 'عرض الجدول' : 'SHOW SCHEDULE'}
                  </button>
                </form>
                <ol className="h2h-preview">
                  {preview
                    .filter((f) => f.gameweekId === round?.id)
                    .map((f, i) => (
                      <li key={i}>
                        {
                          rounds.find((r) => r.id === f.gameweekId)?.name[
                            locale
                          ]
                        }{' '}
                        · {names.get(f.homeId)} —{' '}
                        {f.awayId ? names.get(f.awayId) : ar ? 'راحة' : 'BYE'}
                      </li>
                    ))}
                </ol>
                {beforeDeadline && (
                  <EditionControl
                    locale={locale}
                    edition={edition}
                    kind="publish"
                    roster={roster.map((e) => e.id)}
                  />
                )}
              </>
            )}
          </section>
        )}
        {edition.status === 'published' && (
          <>
            <div className="results-scroll">
              <table className="results-table h2h-table">
                <thead>
                  <tr>
                    <th>{ar ? 'المركز' : 'Rank'}</th>
                    <th>{ar ? 'الفريق' : 'Squad'}</th>
                    <th>{ar ? 'لعب' : 'Played'}</th>
                    <th>{ar ? 'فوز' : 'W'}</th>
                    <th>{ar ? 'تعادل' : 'D'}</th>
                    <th>{ar ? 'خسارة' : 'L'}</th>
                    <th>{ar ? 'نقاط المواجهات' : 'H2H points'}</th>
                    <th>{ar ? 'نقاط الفانتازي' : 'Fantasy points'}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => (
                    <tr key={row.entryId}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.draws}</td>
                      <td>{row.losses}</td>
                      <td className="score-number">{row.tablePoints}</td>
                      <td>
                        {(row.fantasyPoints / 1000).toLocaleString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="group-form h2h-round-selector">
              <label>
                {ar ? 'الجولة' : 'Gameweek'}
                <select name="round" defaultValue={round?.id}>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button-outline" type="submit">
                {ar ? 'عرض المواجهات' : 'SHOW MATCHUPS'}
              </button>
            </form>
            <div className="group-grid">
              {matches
                .filter((m) => m.gameweekId === round?.id)
                .map((m) => (
                  <article
                    className="group-card h2h-match"
                    key={`${m.gameweekId}:${m.homeId}`}
                  >
                    <span className="eyebrow">{m.gameweekName[locale]}</span>
                    <h2>
                      {m.homeName} <span>—</span>{' '}
                      {m.awayName ?? (ar ? 'راحة' : 'BYE')}
                    </h2>
                    <strong className="h2h-score">
                      {m.homePoints === null
                        ? '—'
                        : (m.homePoints / 1000).toLocaleString(locale)}{' '}
                      :{' '}
                      {m.awayPoints === null
                        ? '—'
                        : (m.awayPoints / 1000).toLocaleString(locale)}
                    </strong>
                    {(m.homeForfeit || m.awayForfeit) && (
                      <p>
                        {ar ? 'انسحاب مسجّل' : 'Recorded forfeit'}:{' '}
                        {m.homeForfeit ? m.homeName : ''}{' '}
                        {m.awayForfeit ? m.awayName : ''}
                      </p>
                    )}
                    <p>
                      {m.outcome === null
                        ? ar
                          ? 'بانتظار النقاط'
                          : 'Awaiting points'
                        : m.final
                          ? ar
                            ? 'نهائية'
                            : 'Final'
                          : ar
                            ? 'مؤقتة'
                            : 'Provisional'}
                    </p>
                    {m.outcome && (
                      <p>
                        {m.outcome === 'bye'
                          ? ar
                            ? 'راحة — صفر نقاط'
                            : 'Bye — zero table points'
                          : m.outcome === 'double-forfeit'
                            ? ar
                              ? 'انسحاب الفريقين — صفر نقاط'
                              : 'Double forfeit — zero table points'
                            : m.outcome === 'draw'
                              ? ar
                                ? 'تعادل'
                                : 'Draw'
                              : `${ar ? 'الفائز' : 'Winner'}: ${m.outcome === 'home' ? m.homeName : (m.awayName ?? '')}`}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
    </SiteShell>
  );
}
