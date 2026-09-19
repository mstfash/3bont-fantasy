import Link from 'next/link';
import { findCatalogueFootballers } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import { idSchema } from '@fantasy/contracts';
export default async function CataloguePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    season?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const staff = await requireStaff(locale, 'facts.manage', null);
  const db = getRuntime().db;
  const query = await searchParams;
  const seasons = await db
    .selectFrom('seasons')
    .select('data')
    .orderBy('id')
    .execute();
  const seasonId = idSchema.safeParse(query.season).data ?? seasons[0]?.data.id;
  const season = seasons.find((s) => s.data.id === seasonId)?.data;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1),
  );
  const search = (query.q ?? '').slice(0, 100);
  const clubs = season
    ? await db
        .selectFrom('clubs')
        .select('data')
        .where('season_id', '=', season.id)
        .orderBy('id')
        .execute()
    : [];
  const players = season
    ? await findCatalogueFootballers(db, season.id, search, (page - 1) * 50)
    : [];
  const clubNames = new Map(clubs.map((c) => [c.data.id, c.data.name[locale]]));
  const base = `/${locale}/admin/catalogue`;
  const pageHref = (p: number) =>
    `${base}?${new URLSearchParams({ season: seasonId ?? '', q: search, page: String(p) })}`;
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'الأسماء. الأندية. المصادر.' : 'NAMES. CLUBS. SOURCES.'}
        </span>
        <h1>{ar ? 'دليل كرة القدم' : 'THE FOOTBALL CATALOGUE'}</h1>
        <p>
          {ar
            ? 'سجلات الموسم والقيم السوقية الموثقة، منفصلة عن أسعار الفانتازي.'
            : 'Season records and sourced market values, separate from fantasy prices.'}
        </p>
      </div>
      <p>
        <Link href={`${base}/import`}>
          {ar ? 'استيراد دفعة ومراجعتها ↗' : 'Review a batch import ↗'}
        </Link>
        {season && (
          <>
            {' '}
            ·{' '}
            <a
              href={`/api/v1/admin/catalogue/export?season=${encodeURIComponent(season.id)}`}
            >
              {ar ? 'تصدير الموسم' : 'Export season'}
            </a>
          </>
        )}
      </p>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>{ar ? 'المواسم' : 'Seasons'}</h2>
          <Link href={`${base}/season/new`}>
            {ar ? 'إضافة موسم ↗' : 'Add season ↗'}
          </Link>
        </div>
        <form className="admin-form">
          <div className="form-pair">
            <label>
              {ar ? 'الموسم' : 'Season'}
              <select name="season" defaultValue={seasonId}>
                {seasons.map(({ data: s }) => (
                  <option key={s.id} value={s.id}>
                    {s.name[locale]}
                    {s.synthetic ? (ar ? ' (تجريبي)' : ' (fictional)') : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ar ? 'ابحث عن لاعب' : 'Find a footballer'}
              <input name="q" maxLength={100} defaultValue={search} />
            </label>
          </div>
          <button className="button-outline" type="submit">
            {ar ? 'عرض' : 'Show'}
          </button>
        </form>
        {season && (
          <div className="admin-panel-heading">
            <span>{season.name[locale]}</span>
            <Link href={`${base}/season/${season.id}`}>
              {ar ? 'تعديل الموسم ↗' : 'Edit season ↗'}
            </Link>
          </div>
        )}
      </section>
      {season && (
        <>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>{ar ? 'الأندية' : 'Clubs'}</h2>
              <Link href={`${base}/club/new?season=${season.id}`}>
                {ar ? 'إضافة نادٍ ↗' : 'Add club ↗'}
              </Link>
            </div>
            <div className="catalogue-clubs">
              {clubs.map(({ data: c }) => (
                <Link key={c.id} href={`${base}/club/${c.id}`}>
                  <span
                    className="catalogue-club-mark"
                    style={{ borderColor: c.color }}
                  >
                    {c.shortName}
                  </span>
                  {c.name[locale]} ↗
                </Link>
              ))}
            </div>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>{ar ? 'اللاعبون' : 'Footballers'}</h2>
              {clubs.length > 0 && (
                <Link href={`${base}/footballer/new?season=${season.id}`}>
                  {ar ? 'إضافة لاعب ↗' : 'Add footballer ↗'}
                </Link>
              )}
            </div>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ar ? 'اللاعب' : 'Footballer'}</th>
                    <th>{ar ? 'النادي' : 'Club'}</th>
                    <th>{ar ? 'المركز' : 'Position'}</th>
                    <th>{ar ? 'التقييم' : 'Valuation'}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.slice(0, 50).map(({ data: p }) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`${base}/footballer/${p.id}`}>
                          {p.name[locale]} ↗
                        </Link>
                      </td>
                      <td>{clubNames.get(p.clubId)}</td>
                      <td>{p.defaultPosition}</td>
                      <td>
                        {p.valuation
                          ? `${p.valuation.sourceName} · ${p.valuation.licensedForDisplay ? (ar ? 'حق عرض مؤكد' : 'Display rights verified') : ar ? 'غير معروض' : 'Not public'}`
                          : ar
                            ? 'غير متاح'
                            : 'Unavailable'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-panel-heading">
              {page > 1 && (
                <Link href={pageHref(page - 1)}>
                  {ar ? 'السابق' : 'Previous'}
                </Link>
              )}
              <span>{page}</span>
              {players.length > 50 && (
                <Link href={pageHref(page + 1)}>{ar ? 'التالي' : 'Next'}</Link>
              )}
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
