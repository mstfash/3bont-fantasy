import Link from 'next/link';
import { notFound } from 'next/navigation';
import { capabilityScopes } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function ModerationDirectory({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale),
    db = getRuntime().db,
    scopes = capabilityScopes(context.grants, 'moderation.manage'),
    global = scopes.includes(null),
    ids = scopes.filter((s) => s !== null);
  if (!global && !ids.length) notFound();
  const rooms = await db
    .selectFrom('league_groups')
    .leftJoin('chat_reports', (join) =>
      join
        .onRef('chat_reports.group_id', '=', 'league_groups.id')
        .on('chat_reports.state', '=', 'open')
        .on('chat_reports.expires_at', '>', new Date()),
    )
    .select(['league_groups.id', 'league_groups.data'])
    .select(({ fn }) => fn.count<string>('chat_reports.id').as('open'))
    .$if(!global, (q) => q.where('league_groups.competition_id', 'in', ids))
    .groupBy(['league_groups.id', 'league_groups.data'])
    .orderBy('open', 'desc')
    .orderBy('league_groups.id')
    .limit(100)
    .execute();
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'مراجعة المجتمعات' : 'COMMUNITY REVIEW'}
        </span>
        <h1>{ar ? 'المنافسة باحترام.' : 'RESPECT THE RIVAL.'}</h1>
        <p>
          {ar
            ? 'حتى ١٠٠ غرفة، البلاغات المفتوحة أولاً. الصلاحيات حسب البطولة.'
            : 'Up to 100 rooms, open reports first. Access follows your competition scope.'}
        </p>
      </div>
      <div className="group-grid">
        {rooms.map((r) => (
          <Link
            className="group-card"
            key={r.id}
            href={`/${locale}/admin/moderation/${r.id}`}
          >
            <h2>{r.data.name}</h2>
            <p>
              {ar ? 'بلاغات مفتوحة' : 'Open reports'}: {r.open} ↗
            </p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
