import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function MatchesPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const context = await requireStaff(locale, 'facts.manage', null);
  const db = getRuntime().db;
  const [fixtures, clubs] = await Promise.all([
    db
      .selectFrom('fixtures')
      .select('data')
      .orderBy('kickoff', 'desc')
      .limit(200)
      .execute(),
    db.selectFrom('clubs').select('data').execute(),
  ]);
  const names = new Map(clubs.map((c) => [c.data.id, c.data.name[locale]]));
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'مصدر النقاط' : 'WHERE POINTS BEGIN'}
        </span>
        <h1>{ar ? 'كل مباراة. بالدليل.' : 'EVERY MATCH. ON RECORD.'}</h1>
        <p>
          {ar
            ? 'سجل المشاركة وراجع التصحيحات. هذه الحقائق مشتركة بين بطولات الموسم.'
            : 'Record participation and review corrections. Football facts are shared by every competition using the season.'}
        </p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'المباراة' : 'Fixture'}</th>
                <th>{ar ? 'موعد القاهرة' : 'Cairo kickoff'}</th>
                <th>{ar ? 'الحالة' : 'Status'}</th>
                <th>{ar ? 'البيانات' : 'Data'}</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map(({ data: f }) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/${locale}/admin/matches/${f.id}`}>
                      {names.get(f.homeClubId)} — {names.get(f.awayClubId)} ↗
                    </Link>
                  </td>
                  <td>{deadlineLabel(f.kickoff, locale)}</td>
                  <td>{f.status}</td>
                  <td>
                    {f.factsComplete
                      ? ar
                        ? 'مكتملة'
                        : 'Complete'
                      : ar
                        ? 'غير مكتملة'
                        : 'Incomplete'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
