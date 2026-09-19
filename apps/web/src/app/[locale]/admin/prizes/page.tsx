import Link from 'next/link';
import { notFound } from 'next/navigation';
import { capabilityScopes } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { PrizePoolEditor } from '@/components/prizes/pool-editor';
import { requireLocale } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import { requireStaffSession } from '@/server/staff';
import '@/styles/groups.css';
export default async function PrizeDirectory({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ competition?: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale),
    db = getRuntime().db;
  const scopes = [
      ...capabilityScopes(context.grants, 'prizes.prepare'),
      ...capabilityScopes(context.grants, 'prizes.approve'),
    ],
    global = scopes.includes(null),
    ids = scopes.filter((s) => s !== null);
  if (!global && !ids.length) notFound();
  const competitions = await db
    .selectFrom('competitions')
    .select('data')
    .$if(!global, (q) => q.where('id', 'in', ids))
    .orderBy('slug')
    .execute();
  const selected = (await searchParams).competition ?? competitions[0]?.data.id;
  const competition = competitions.find((c) => c.data.id === selected)?.data;
  const canPrepare = capabilityScopes(context.grants, 'prizes.prepare').some(
    (s) => s === null || s === selected,
  );
  const [pools, rounds, groups, correctionRows] = competition
    ? await Promise.all([
        db
          .selectFrom('prize_pools')
          .select('data')
          .where('competition_id', '=', competition.id)
          .orderBy('id')
          .execute(),
        db
          .selectFrom('gameweeks')
          .select('data')
          .where('competition_id', '=', competition.id)
          .orderBy('number')
          .execute(),
        db
          .selectFrom('league_groups')
          .select('data')
          .where('competition_id', '=', competition.id)
          .execute(),
        db
          .selectFrom('prize_correction_cases')
          .select(['pool_id', 'data'])
          .where('competition_id', '=', competition.id)
          .execute(),
      ])
    : [[], [], [], []];
  const openCases = new Map<string, number>();
  for (const row of correctionRows)
    if (row.data.state === 'open')
      openCases.set(row.pool_id, (openCases.get(row.pool_id) ?? 0) + 1);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">{ar ? 'الجوائز' : 'AWARD OPERATIONS'}</span>
        <h1>{ar ? 'وعد واضح. جائزة عادلة.' : 'CLEAR TERMS. FAIR AWARDS.'}</h1>
        <p>
          {ar
            ? 'شروط ثابتة، نتائج نهائية، اعتماد مستقل، وتسليم موثّق.'
            : 'Frozen terms, final results, independent approval and recorded fulfillment.'}
        </p>
      </div>
      <form className="group-form" method="get">
        <label>
          {ar ? 'البطولة' : 'Competition'}
          <select
            name="competition"
            defaultValue={selected}
            aria-label={ar ? 'البطولة' : 'Competition'}
          >
            {competitions.map((c) => (
              <option key={c.data.id} value={c.data.id}>
                {c.data.name[locale]}
              </option>
            ))}
          </select>
        </label>
        <button className="button-outline">{ar ? 'عرض' : 'Show'}</button>
      </form>
      <div className="group-grid">
        {pools.map(({ data: p }) => (
          <article className="group-card" key={p.id}>
            <span className="eyebrow">
              {p.state === 'draft'
                ? ar
                  ? 'مسودة'
                  : 'DRAFT'
                : ar
                  ? 'شروط منشورة'
                  : 'PUBLISHED TERMS'}
            </span>
            <h2>
              <Link href={`/${locale}/admin/prizes/${p.id}`}>
                {p.name[locale]}
              </Link>
            </h2>
            <p>{p.description[locale]}</p>
            {!!openCases.get(p.id) && (
              <p>
                {ar
                  ? 'تصحيحات بعد التسليم تحتاج مراجعة'
                  : 'Post-delivery corrections need review'}
                : {openCases.get(p.id)}
              </p>
            )}
          </article>
        ))}
      </div>
      {competition && canPrepare && rounds.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'جائزة جديدة' : 'New award pool'}</h2>
          <PrizePoolEditor
            key={competition.id}
            locale={locale}
            competitionId={competition.id}
            rounds={rounds.map((r) => r.data)}
            groups={groups.map((g) => g.data)}
            pool={null}
          />
        </section>
      )}
    </AdminShell>
  );
}
