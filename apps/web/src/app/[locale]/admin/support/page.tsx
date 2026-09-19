import Link from 'next/link';
import { notFound } from 'next/navigation';
import { capabilityScopes, readSupportEntries } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
import '@/styles/results.css';
export default async function Support({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ competition?: string; q?: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale),
    db = getRuntime().db,
    scopes = capabilityScopes(context.grants, 'operations.read'),
    global = scopes.includes(null),
    ids = scopes.filter((s) => s !== null),
    search = await searchParams;
  if (!global && !ids.length) notFound();
  const competitions = await db
    .selectFrom('competitions')
    .select('data')
    .$if(!global, (q) => q.where('id', 'in', ids))
    .orderBy('slug')
    .execute();
  const competition = competitions.find(
    (c) => c.data.id === (search.competition ?? competitions[0]?.data.id),
  )?.data;
  const data = competition
    ? await readSupportEntries(
        db,
        context.principal,
        context.grants,
        competition.id,
        search.q ?? '',
      )
    : null;
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'متابعة التشغيل' : 'SUPPORT DESK'}
        </span>
        <h1>{ar ? 'كل حالة. واضحة.' : 'EVERY STATUS. EXPLAINED.'}</h1>
        <p>
          {ar
            ? 'حالة الفرق والجولات للمساعدة في التحقيق. التشكيلات القادمة وبيانات الدخول خاصة بأصحابها.'
            : 'Operational squad and round status for investigation. Upcoming lineups and sign-in details remain private.'}
        </p>
      </div>
      <form className="group-form" method="get">
        <label>
          {ar ? 'البطولة' : 'Competition'}
          <select name="competition" defaultValue={competition?.id}>
            {competitions.map((c) => (
              <option key={c.data.id} value={c.data.id}>
                {c.data.name[locale]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ar
            ? 'اسم الفريق أو الحساب أو معرّف الحساب'
            : 'Squad name, display name or account ID'}
          <input name="q" defaultValue={search.q ?? ''} maxLength={100} />
        </label>
        <button className="button-outline">
          {ar ? 'عرض الحالة' : 'Show status'}
        </button>
      </form>
      {data && (
        <>
          <div className="group-grid">
            {data.entries.map((e) => (
              <article className="group-card" key={e.id}>
                <span className="eyebrow">
                  {e.status === 'draft'
                    ? ar
                      ? 'مسودة'
                      : 'DRAFT'
                    : e.status === 'active'
                      ? ar
                        ? 'نشط'
                        : 'ACTIVE'
                      : ar
                        ? 'منسحب'
                        : 'WITHDRAWN'}
                </span>
                <h2>
                  <bdi>{e.name}</bdi>
                </h2>
                <p>
                  <bdi>{e.displayName}</bdi>
                </p>
                <dl className="support-facts">
                  <dt>{ar ? 'معرّف الفريق' : 'Squad ID'}</dt>
                  <dd>
                    <bdi>{e.id}</bdi>
                  </dd>
                  <dt>{ar ? 'معرّف الحساب' : 'Account ID'}</dt>
                  <dd>
                    <bdi>{e.accountId}</bdi>
                  </dd>
                  <dt>{ar ? 'إصدار الفريق' : 'Squad revision'}</dt>
                  <dd>{e.revision}</dd>
                  <dt>{ar ? 'لقطات مغلقة' : 'Locked snapshots'}</dt>
                  <dd>{e.lockedSnapshots}</dd>
                  <dt>{ar ? 'جولة التحرير' : 'Editing round'}</dt>
                  <dd>{e.editingRound?.[locale] ?? '—'}</dd>
                </dl>
                {e.closedAt && (
                  <p>
                    {ar
                      ? 'الحساب مغلق؛ السجل محفوظ'
                      : 'Account closed; history retained'}
                  </p>
                )}
                {e.suspendedUntil &&
                  Date.parse(e.suspendedUntil) > Date.now() && (
                    <p>
                      {ar
                        ? 'الحساب موقوف مؤقتاً'
                        : 'Account temporarily suspended'}
                    </p>
                  )}
                {competition && e.lockedSnapshots > 0 && (
                  <Link
                    href={`/${locale}/competitions/${competition.slug}/results/${e.id}`}
                  >
                    {ar ? 'النتائج المنشورة ↗' : 'Published results ↗'}
                  </Link>
                )}
              </article>
            ))}
          </div>
          <section className="group-card">
            <h2>{ar ? 'حالة الجولات' : 'Round status'}</h2>
            <div className="results-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>{ar ? 'الجولة' : 'Round'}</th>
                    <th>{ar ? 'الحالة' : 'Status'}</th>
                    <th>{ar ? 'الموعد النهائي' : 'Deadline'}</th>
                    <th>{ar ? 'مراجعات مفتوحة' : 'Open reviews'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rounds.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name[locale]}</td>
                      <td>
                        {
                          {
                            upcoming: ar ? 'قادمة' : 'Upcoming',
                            locked: ar ? 'مغلقة' : 'Locked',
                            review: ar ? 'قيد المراجعة' : 'Under review',
                            provisional: ar ? 'مؤقتة' : 'Provisional',
                            finalized: ar ? 'نهائية' : 'Final',
                          }[r.status]
                        }
                      </td>
                      <td>
                        <bdi>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'Africa/Cairo',
                          }).format(new Date(r.deadline))}
                        </bdi>
                      </td>
                      <td>
                        {
                          data.reviews.filter((v) => v.gameweekId === r.id)
                            .length
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
