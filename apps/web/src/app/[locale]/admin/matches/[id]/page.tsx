import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  factChangeSchema,
  fixtureSchema,
  fixtureObservationSchema,
  footballerSchema,
  idSchema,
} from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { ProviderMatchWorkspace } from '@/components/provider-match-workspace';
import {
  readNormalizationSources,
  readSavedProviderReview,
} from '@fantasy/application';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function MatchPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(p.id).success) notFound();
  const context = await requireStaff(locale, 'facts.manage', null);
  const db = getRuntime().db;
  const row = await db
    .selectFrom('fixtures')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!row) notFound();
  const fixture = fixtureSchema.parse(row.data);
  const [observationRow, footballerRows, clubs, facts] = await Promise.all([
    db
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', p.id)
      .orderBy('revision', 'desc')
      .executeTakeFirst(),
    db
      .selectFrom('footballers')
      .select('data')
      .where('season_id', '=', fixture.seasonId)
      .execute(),
    db
      .selectFrom('clubs')
      .select('data')
      .where('id', 'in', [fixture.homeClubId, fixture.awayClubId])
      .execute(),
    db
      .selectFrom('fact_revisions')
      .selectAll()
      .where('fixture_id', '=', p.id)
      .orderBy('revision', 'desc')
      .execute(),
  ]);
  const observation = observationRow
    ? fixtureObservationSchema.parse(observationRow.payload)
    : null;
  const footballers = footballerRows.map((r) => footballerSchema.parse(r.data));
  const [sources, savedReview] = await Promise.all([
    readNormalizationSources(db, context.principal, context.grants, fixture.id),
    readSavedProviderReview(db, context.principal, context.grants, fixture.id),
  ]);
  const revisions: Record<string, number> = {};
  const overrides = new Map<string, (typeof facts)[number]>();
  for (const fact of facts) {
    revisions[fact.footballer_id] ??= fact.revision;
    if (fact.is_override && !overrides.has(fact.footballer_id))
      overrides.set(fact.footballer_id, fact);
  }
  const active = [...overrides.values()].filter(
    (f) => factChangeSchema.parse(f.payload).kind === 'performance',
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link className="eyebrow" href={`/${locale}/admin/matches`}>
          {ar ? 'المباريات' : 'MATCHES'} ↗
        </Link>
        <h1>
          {
            clubs.find((c) => c.data.id === fixture.homeClubId)?.data.name[
              locale
            ]
          }
          <br />
          {
            clubs.find((c) => c.data.id === fixture.awayClubId)?.data.name[
              locale
            ]
          }
        </h1>
      </div>
      {active.length > 0 && (
        <section className="admin-panel">
          <h2>
            {ar ? 'تصحيحات ثابتة سارية' : 'Active persistent corrections'}
          </h2>
          {active.map((f) => (
            <p key={f.id}>
              <strong>
                {
                  footballers.find((p) => p.id === f.footballer_id)?.name[
                    locale
                  ]
                }
              </strong>{' '}
              — {f.reason}
            </p>
          ))}
          <p>
            {ar
              ? 'النموذج يعرض بيانات التقرير. التصحيحات أعلاه لها الأولوية حتى إزالتها صراحة.'
              : 'The form shows reported data. These corrections take precedence until explicitly released.'}
          </p>
        </section>
      )}
      <ProviderMatchWorkspace
        sources={sources}
        savedReview={savedReview}
        locale={locale}
        fixture={fixture}
        observation={observation}
        footballers={footballers}
        factRevisions={revisions}
      />
    </AdminShell>
  );
}
