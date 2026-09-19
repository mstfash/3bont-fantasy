import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  competitionSchema,
  idSchema,
  footballerSchema,
  poolPlayerSchema,
  fixtureSchema,
  gameweekSchema,
  clubSchema,
} from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { ChipGrantEditor } from '@/components/chip-grant-editor';
import { CompetitionEditor } from '@/components/competition-editor';
import { PlayerPoolEditor, GameweekEditor } from '@/components/setup-editor';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';

export default async function CompetitionAdmin({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  if (!idSchema.safeParse(p.id).success) notFound();
  const context = await requireStaff(locale, 'competition.manage', p.id);
  const row = await getRuntime()
    .db.selectFrom('competitions')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!row) notFound();
  const competition = competitionSchema.parse(row.data);
  const db = getRuntime().db;
  const [players, pool, rounds, fixtures, clubs, assigned, chipGrants] =
    await Promise.all([
      db
        .selectFrom('footballers')
        .select('data')
        .where('season_id', '=', competition.seasonId)
        .execute(),
      db
        .selectFrom('competition_players')
        .select('data')
        .where('competition_id', '=', competition.id)
        .execute(),
      db
        .selectFrom('gameweeks')
        .select('data')
        .where('competition_id', '=', competition.id)
        .orderBy('number')
        .execute(),
      db
        .selectFrom('fixtures')
        .select('data')
        .where('season_id', '=', competition.seasonId)
        .orderBy('kickoff')
        .execute(),
      db
        .selectFrom('clubs')
        .select('data')
        .where('season_id', '=', competition.seasonId)
        .execute(),
      db
        .selectFrom('fixture_assignments')
        .selectAll()
        .where('competition_id', '=', competition.id)
        .execute(),
      db
        .selectFrom('chip_grants')
        .select('data')
        .where('competition_id', '=', competition.id)
        .execute(),
    ]);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {competition.status} / {locale === 'ar' ? 'نسخة' : 'REVISION'}{' '}
          {competition.revision}
        </span>
        <h1>{competition.name[locale]}</h1>
      </div>
      <section className="admin-panel">
        <h2>
          {locale === 'ar' ? 'مراجعة نتائج الجولات' : 'Review gameweek results'}
        </h2>
        <div className="admin-actions">
          {rounds.map(({ data: round }) => (
            <Link key={round.id} href={`/${locale}/admin/results/${round.id}`}>
              {round.name[locale]} ↗
            </Link>
          ))}
        </div>
      </section>
      <Link
        className="button-outline"
        href={`/${locale}/admin/competitions/${p.id}/prices`}
      >
        {locale === 'ar' ? 'معاينة دفعة الأسعار ↗' : 'PREVIEW PRICE BATCH ↗'}
      </Link>
      <Link
        className="button-outline"
        href={`/${locale}/admin/competitions/${p.id}/achievements`}
      >
        {locale === 'ar' ? 'إدارة الإنجازات ↗' : 'MANAGE ACHIEVEMENTS ↗'}
      </Link>
      <CompetitionEditor
        initialOpens={new Date().toISOString()}
        locale={locale}
        competition={competition}
        seasons={[]}
        gameweeks={rounds.map((g) => gameweekSchema.parse(g.data))}
      />
      <ChipGrantEditor
        locale={locale}
        competition={competition}
        rounds={rounds.map((g) => g.data)}
        grants={chipGrants.map((g) => g.data)}
      />
      <GameweekEditor
        locale={locale}
        competition={competition}
        gameweeks={rounds.map((g) => gameweekSchema.parse(g.data))}
        fixtures={fixtures.map((f) => fixtureSchema.parse(f.data))}
        assignments={assigned.map((a) => ({
          fixtureId: a.fixture_id,
          gameweekId: a.gameweek_id,
        }))}
        clubNames={Object.fromEntries(
          clubs.map((c) => {
            const club = clubSchema.parse(c.data);
            return [club.id, club.name[locale]];
          }),
        )}
      />
      <PlayerPoolEditor
        sourceAsOf={new Date().toISOString()}
        locale={locale}
        competition={competition}
        footballers={players.map((p) => footballerSchema.parse(p.data))}
        pool={pool.map((p) => poolPlayerSchema.parse(p.data))}
      />
    </AdminShell>
  );
}
