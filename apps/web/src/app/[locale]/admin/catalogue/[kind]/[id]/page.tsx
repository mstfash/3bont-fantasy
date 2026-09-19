import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { catalogueFingerprint } from '@fantasy/application';
import { idSchema, type CatalogueCommand } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { CatalogueEditor } from '@/components/catalogue/catalogue-editor';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function CatalogueRecord({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; kind: string; id: string }>;
  readonly searchParams: Promise<{ season?: string }>;
}) {
  const route = await params;
  const locale = requireLocale(route.locale);
  const ar = locale === 'ar';
  const staff = await requireStaff(locale, 'facts.manage', null);
  const db = getRuntime().db;
  const isNew = route.id === 'new';
  const id = isNew ? randomUUID() : idSchema.safeParse(route.id).data;
  if (!id) notFound();
  const requestedSeason = (await searchParams).season;
  const base = {
    commandId: randomUUID(),
    reason: '',
    expectedFingerprint: null,
  };
  let initial: CatalogueCommand;
  if (route.kind === 'season') {
    const existing = isNew
      ? undefined
      : await db
          .selectFrom('seasons')
          .select('data')
          .where('id', '=', id)
          .executeTakeFirst();
    if (!isNew && !existing) notFound();
    initial = {
      ...base,
      kind: 'season',
      season: existing?.data ?? {
        id,
        name: { ar: '', en: '' },
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        synthetic: false,
      },
      expectedFingerprint: existing
        ? catalogueFingerprint(existing.data)
        : null,
    };
  } else if (route.kind === 'club' || route.kind === 'footballer') {
    const existing = isNew
      ? undefined
      : route.kind === 'club'
        ? await db
            .selectFrom('clubs')
            .select('data')
            .where('id', '=', id)
            .executeTakeFirst()
        : await db
            .selectFrom('footballers')
            .select('data')
            .where('id', '=', id)
            .executeTakeFirst();
    if (!isNew && !existing) notFound();
    const seasonId =
      existing?.data.seasonId ?? idSchema.safeParse(requestedSeason).data;
    if (!seasonId) notFound();
    const season = await db
      .selectFrom('seasons')
      .select('data')
      .where('id', '=', seasonId)
      .executeTakeFirst();
    if (!season) notFound();
    const expectedFingerprint = existing
      ? catalogueFingerprint(existing.data)
      : null;
    if (route.kind === 'club') {
      const record =
        existing && 'shortName' in existing.data ? existing.data : undefined;
      initial = {
        ...base,
        expectedFingerprint,
        kind: 'club',
        club: record ?? {
          id,
          seasonId,
          name: { ar: '', en: '' },
          shortName: '',
          color: '#d5ed63',
        },
      };
    } else {
      const record =
        existing && 'defaultPosition' in existing.data
          ? existing.data
          : undefined;
      const club = await db
        .selectFrom('clubs')
        .select('id')
        .where('season_id', '=', seasonId)
        .orderBy('id')
        .executeTakeFirst();
      if (!club) notFound();
      initial = {
        ...base,
        expectedFingerprint,
        kind: 'footballer',
        footballer: record ?? {
          id,
          seasonId,
          clubId: club.id,
          name: { ar: '', en: '' },
          defaultPosition: 'MID',
          status: 'available',
          valuation: null,
          synthetic: season.data.synthetic,
        },
      };
    }
  } else notFound();
  const clubs =
    initial.kind === 'footballer'
      ? await db
          .selectFrom('clubs')
          .select('data')
          .where('season_id', '=', initial.footballer.seasonId)
          .orderBy('id')
          .execute()
      : [];
  const labels = {
    season: ar ? 'موسم' : 'SEASON',
    club: ar ? 'نادٍ' : 'CLUB',
    footballer: ar ? 'لاعب' : 'FOOTBALLER',
  };
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'دليل كرة القدم' : 'FOOTBALL CATALOGUE'}
        </span>
        <h1>
          {isNew ? (ar ? 'إضافة' : 'NEW') : ar ? 'تعديل' : 'EDIT'}{' '}
          {labels[initial.kind]}
        </h1>
      </div>
      <section className="admin-panel">
        <CatalogueEditor
          key={`${route.id}:${initial.expectedFingerprint ?? 'new'}`}
          locale={locale}
          initial={initial}
          clubs={clubs.map((c) => c.data)}
        />
      </section>
    </AdminShell>
  );
}
