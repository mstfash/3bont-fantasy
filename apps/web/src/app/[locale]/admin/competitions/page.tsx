import Link from 'next/link';
import { capabilityScopes } from '@fantasy/application';
import { competitionSchema, seasonSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { CompetitionEditor } from '@/components/competition-editor';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';

export default async function CompetitionsPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const context = await requireStaffSession(locale);
  const scopes = capabilityScopes(context.grants, 'competition.manage');
  const global = scopes.includes(null);
  const ids = scopes.filter((s) => s !== null);
  const db = getRuntime().db;
  const rows = global
    ? await db
        .selectFrom('competitions')
        .select('data')
        .orderBy('slug')
        .execute()
    : ids.length > 0
      ? await db
          .selectFrom('competitions')
          .select('data')
          .where('id', 'in', ids)
          .orderBy('slug')
          .execute()
      : [];
  const seasons = global
    ? (await db.selectFrom('seasons').select('data').execute()).map((s) =>
        seasonSchema.parse(s.data),
      )
    : [];
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">{ar ? 'بطولاتك' : 'YOUR COMPETITIONS'}</span>
        <h1>{ar ? 'كل بطولة. قواعدها.' : 'EVERY GAME. YOUR RULES.'}</h1>
      </div>
      <div className="competition-grid">
        {rows.map((row) => {
          const c = competitionSchema.parse(row.data);
          return (
            <Link
              className="competition-card"
              key={c.id}
              href={`/${locale}/admin/competitions/${c.id}`}
            >
              <span className="eyebrow">{c.status}</span>
              <h2>{c.name[locale]}</h2>
              <p>{c.description[locale]}</p>
            </Link>
          );
        })}
      </div>
      {global && (
        <>
          <div className="admin-title">
            <h2>{ar ? 'بطولة جديدة' : 'New competition'}</h2>
          </div>
          <CompetitionEditor
            initialOpens={new Date().toISOString()}
            locale={locale}
            competition={null}
            seasons={seasons}
          />
        </>
      )}
    </AdminShell>
  );
}
