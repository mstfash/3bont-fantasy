import { notFound } from 'next/navigation';
import {
  clubSchema,
  competitionSchema,
  footballerSchema,
  gameweekSchema,
  poolPlayerSchema,
} from '@fantasy/contracts';
import { getRuntime } from './runtime';

export async function competitionDetails(slug: string) {
  const db = getRuntime().db;
  const row = await db
    .selectFrom('competitions')
    .select('data')
    .where('slug', '=', slug)
    .executeTakeFirst();
  if (!row) notFound();
  const competition = competitionSchema.parse(row.data);
  if (!['published', 'running', 'completed'].includes(competition.status))
    notFound();
  const [rounds, players, season, chipGrants] = await Promise.all([
    db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('number')
      .execute(),
    db
      .selectFrom('competition_players')
      .innerJoin(
        'footballers',
        'footballers.id',
        'competition_players.footballer_id',
      )
      .innerJoin('clubs', 'clubs.id', 'footballers.club_id')
      .select([
        'competition_players.data as pool',
        'footballers.data as footballer',
        'clubs.data as club',
      ])
      .where('competition_players.competition_id', '=', competition.id)
      .execute(),
    db
      .selectFrom('seasons')
      .select('data')
      .where('id', '=', competition.seasonId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('chip_grants')
      .select('data')
      .where('competition_id', '=', competition.id)
      .execute(),
  ]);
  return {
    competition,
    chipGrants: chipGrants.map((g) => g.data),
    synthetic: season.data.synthetic,
    gameweeks: rounds.map((r) => gameweekSchema.parse(r.data)),
    players: players.map((p) => {
      const footballer = footballerSchema.parse(p.footballer);
      return {
        valuationStale:
          !!footballer.valuation &&
          Date.now() - Date.parse(footballer.valuation.asOf) > 90 * 86400000,
        pool: poolPlayerSchema.parse(p.pool),
        footballer: {
          ...footballer,
          valuation: footballer.valuation?.licensedForDisplay
            ? footballer.valuation
            : null,
        },
        club: clubSchema.parse(p.club),
      };
    }),
  };
}
