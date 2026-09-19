import Link from 'next/link';
import { competitionSchema } from '@fantasy/contracts';
import { capabilityScopes } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';

export default async function AdminOverview({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const context = await requireStaffSession(locale);
  const db = getRuntime().db;
  const scopes = capabilityScopes(context.grants, 'operations.read');
  const global = scopes.includes(null);
  const ids = scopes.filter((scope) => scope !== null);
  const competitions = global
    ? await db.selectFrom('competitions').select('data').execute()
    : ids.length > 0
      ? await db
          .selectFrom('competitions')
          .select('data')
          .where('id', 'in', ids)
          .execute()
      : [];
  const competitionIds = competitions.map((c) => c.data.id);
  const [reviews, entries] =
    competitionIds.length > 0
      ? await Promise.all([
          db
            .selectFrom('result_reviews')
            .innerJoin(
              'gameweeks',
              'gameweeks.id',
              'result_reviews.gameweek_id',
            )
            .select('result_reviews.id')
            .where('result_reviews.status', '=', 'open')
            .where('gameweeks.competition_id', 'in', competitionIds)
            .execute(),
          db
            .selectFrom('entries')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .where('competition_id', 'in', competitionIds)
            .executeTakeFirstOrThrow(),
        ])
      : [[], { count: '0' }];
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'المشهد الكامل' : 'THE FULL PICTURE'}
        </span>
        <h1>{ar ? 'المنافسة تحت إدارتك.' : 'YOU RUN THE GAME.'}</h1>
        <p>
          {ar
            ? 'بيانات مباشرة من بطولاتك. كل تغيير له مسؤول وسجل.'
            : 'Live records from your competitions. Every change has an owner and an audit trail.'}
        </p>
      </div>
      <nav className="guide-links">
        <Link href={`/${locale}/admin/how-to`}>
          {ar ? 'ابدأ بدليل الإدارة' : 'Start with the admin handbook'} ↗
        </Link>
      </nav>
      <div className="admin-metrics">
        <article>
          <span>{ar ? 'البطولات' : 'COMPETITIONS'}</span>
          <strong>{competitions.length}</strong>
        </article>
        <article>
          <span>{ar ? 'الفرق المسجلة' : 'REGISTERED SQUADS'}</span>
          <strong>{entries.count}</strong>
        </article>
        <article>
          <span>{ar ? 'مراجعات مفتوحة' : 'OPEN REVIEWS'}</span>
          <strong>{reviews.length}</strong>
        </article>
        <article>
          <span>{ar ? 'أمان الجلسة' : 'SESSION SECURITY'}</span>
          <strong className="metric-word">MFA</strong>
          <small>
            {context.principal.mfaVerifiedAt?.toLocaleTimeString(
              ar ? 'ar-EG' : 'en-GB',
              { timeZone: 'Africa/Cairo' },
            )}
          </small>
        </article>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>{ar ? 'البطولات' : 'Competitions'}</h2>
          <Link href={`/${locale}/admin/competitions`}>
            {ar ? 'إدارة البطولات ↗' : 'Manage competitions ↗'}
          </Link>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'البطولة' : 'Competition'}</th>
                <th>{ar ? 'الحالة' : 'Status'}</th>
                <th>{ar ? 'نسخة القواعد' : 'Rules version'}</th>
                <th>{ar ? 'حد الفرق' : 'Squad limit'}</th>
              </tr>
            </thead>
            <tbody>
              {competitions.map((row) => {
                const c = competitionSchema.parse(row.data);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/${locale}/admin/competitions/${c.id}`}>
                        {c.name[locale]}
                      </Link>
                    </td>
                    <td>{c.status}</td>
                    <td>{c.rules.version}</td>
                    <td>{c.entryLimit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
