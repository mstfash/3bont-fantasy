import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  footballerSchema,
  competitionSchema,
  gameweekSchema,
  poolPlayerSchema,
  roundCalculationSchema,
  priceCalibrationBasisSchema,
} from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';

export async function readCalibrationBasis(
  db: ReturnType<typeof createDatabase>,
  competitionId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      await sql`SET LOCAL statement_timeout='10s'`.execute(tx);
      const row = await tx
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', competitionId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('competition-unavailable');
      const competition = competitionSchema.parse(row.data);
      const now = (
        await sql<{ now: Date }>`SELECT transaction_timestamp() AS now`.execute(
          tx,
        )
      ).rows[0]?.now;
      if (!now) throw new Error('Database clock unavailable');
      const [pool, roundRows, season] = await Promise.all([
        tx
          .selectFrom('competition_players')
          .innerJoin(
            'footballers',
            'footballers.id',
            'competition_players.footballer_id',
          )
          .select([
            'competition_players.data as data',
            'footballers.data as footballer',
          ])
          .where('competition_id', '=', competition.id)
          .orderBy('footballer_id')
          .limit(1001)
          .execute(),
        tx
          .selectFrom('gameweeks')
          .select('data')
          .where('competition_id', '=', competition.id)
          .orderBy('number')
          .limit(101)
          .execute(),
        tx
          .selectFrom('seasons')
          .select('data')
          .where('id', '=', competition.seasonId)
          .executeTakeFirstOrThrow(),
      ]);
      if (!pool.length || pool.length > 1000 || roundRows.length > 100)
        throw new CommandRejected('calibration-sample-too-large-or-empty');
      const rounds = roundRows.map((r) => gameweekSchema.parse(r.data));
      if (rounds.some((r) => r.status === 'review'))
        throw new CommandRejected('calibration-results-under-review');
      const finalized = rounds.filter((r) => r.status === 'finalized');
      if (!finalized.length)
        throw new CommandRejected('calibration-needs-finalized-rounds');
      const calculations = await tx
        .selectFrom('round_calculations')
        .innerJoin(
          'gameweeks',
          'gameweeks.id',
          'round_calculations.gameweek_id',
        )
        .select([
          'round_calculations.gameweek_id',
          'round_calculations.revision',
          'round_calculations.payload',
        ])
        .where('gameweeks.competition_id', '=', competition.id)
        .where((eb) =>
          eb.or(
            finalized.map((r) =>
              eb.and([
                eb('round_calculations.gameweek_id', '=', r.id),
                eb('round_calculations.revision', '=', r.resultRevision),
              ]),
            ),
          ),
        )
        .execute();
      const playerIds = new Set(pool.map((p) => p.data.footballerId));
      return priceCalibrationBasisSchema.parse({
        competitionId: competition.id,
        competitionRevision: competition.revision,
        cutoff: now.toISOString(),
        synthetic:
          season.data.synthetic || pool.some((p) => p.footballer.synthetic),
        squad: competition.rules.squad,
        players: pool.map((row) => {
          const p = poolPlayerSchema.parse(row.data);
          return {
            footballerId: p.footballerId,
            clubId: footballerSchema.parse(row.footballer).clubId,
            position: p.position,
            price: p.price,
            pinned: p.manuallyPinned,
            selectable: p.selectable,
          };
        }),
        rounds: rounds.map((r) => {
          if (r.status !== 'finalized')
            return {
              id: r.id,
              number: r.number,
              deadline: r.deadline,
              finalizedAt: null,
              revision: r.resultRevision,
              observations: [],
            };
          const stored = calculations.find(
            (c) => c.gameweek_id === r.id && c.revision === r.resultRevision,
          );
          if (!stored || !r.finalizedAt)
            throw new CommandRejected('finalized-calculation-unavailable');
          const calculation = roundCalculationSchema.parse(stored.payload);
          if (
            !calculation.settled ||
            calculation.issues.length ||
            r.issues.length
          )
            throw new CommandRejected('finalized-calculation-incomplete');
          return {
            id: r.id,
            number: r.number,
            deadline: r.deadline,
            finalizedAt: r.finalizedAt,
            revision: r.resultRevision,
            observations: calculation.players
              .filter((p) => playerIds.has(p.footballerId))
              .map((p) => ({
                footballerId: p.footballerId,
                gameweekId: r.id,
                revision: r.resultRevision,
                number: r.number,
                minutes: p.minutes,
                points: p.points,
              })),
          };
        }),
      });
    });
}
