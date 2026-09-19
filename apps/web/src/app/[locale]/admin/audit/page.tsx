import { AdminShell } from '@/components/admin-shell';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';

export default async function AuditPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const context = await requireStaff(locale, 'staff.manage', null);
  const rows = await getRuntime()
    .db.selectFrom('audit_events')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute();
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'أحدث ١٠٠ عملية' : 'LATEST 100 EVENTS'}
        </span>
        <h1>{ar ? 'كل قرار. مسجّل.' : 'EVERY DECISION. RECORDED.'}</h1>
      </div>
      <section className="admin-panel">
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'التاريخ — القاهرة' : 'Time — Cairo'}</th>
                <th>{ar ? 'العملية' : 'Action'}</th>
                <th>{ar ? 'المسؤول' : 'Actor'}</th>
                <th>{ar ? 'السبب' : 'Reason'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.created_at.toLocaleString(ar ? 'ar-EG' : 'en-GB', {
                      timeZone: 'Africa/Cairo',
                    })}
                  </td>
                  <td>{row.action}</td>
                  <td>
                    <code>{row.actor_id}</code>
                  </td>
                  <td>{row.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
