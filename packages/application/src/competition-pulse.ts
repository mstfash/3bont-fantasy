import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { competitionSchema, gameweekSchema } from '@fantasy/contracts';
import { AccessDenied } from './authorization.ts';
import { standingsWithinTransaction } from './leaderboard.ts';
import { calculateRoundInputs } from './round-inputs.ts';
import { publishedLineupWithinTransaction } from './public-lineup.ts';

/** Coherent public view: no draft competitions, private group membership or editable future squads. */
export async function readCompetitionPulse(
  db: ReturnType<typeof createDatabase>,
  slug: string,
  featuredEntryId?: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('competitions')
        .innerJoin('seasons', 'seasons.id', 'competitions.season_id')
        .select(['competitions.data as competition', 'seasons.data as season'])
        .where('competitions.slug', '=', slug)
        .executeTakeFirst();
      if (
        !row ||
        !['published', 'running', 'completed'].includes(row.competition.status)
      )
        throw new AccessDenied();
      const competition = competitionSchema.parse(row.competition);
      const rounds = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('competition_id', '=', competition.id)
          .orderBy('number', 'desc')
          .execute()
      ).map((r) => gameweekSchema.parse(r.data));
      const latest = rounds.find((r) => r.resultRevision > 0) ?? null;
      const current = latest
        ? await standingsWithinTransaction(tx, competition, {
            throughRound: latest.number,
          })
        : [];
      const previous = latest
        ? await standingsWithinTransaction(tx, competition, {
            throughRound: latest.number - 1,
          })
        : [];
      const previousById = new Map(previous.map((r) => [r.entryId, r]));
      const standings = current.map((r) => ({
        entryId: r.entryId,
        name: r.name,
        rank: r.rank,
        points: r.points,
        previousRank: previousById.get(r.entryId)?.rank ?? null,
        previousPoints: previousById.get(r.entryId)?.points ?? null,
        roundPoints: r.points - (previousById.get(r.entryId)?.points ?? 0),
        provisional: r.provisional,
        retired: r.retired,
        scoredGameweeks: r.scoredGameweeks,
      }));
      const final =
        rounds.find((r) => r.status === 'finalized' && r.resultRevision > 0) ??
        null;
      let winnersHeld = false;
      if (final) {
        const inputs = await calculateRoundInputs(tx, final);
        const recorded = await tx
          .selectFrom('round_calculations')
          .select('payload')
          .where('gameweek_id', '=', final.id)
          .where('revision', '=', final.resultRevision)
          .executeTakeFirst();
        const reviews = await tx
          .selectFrom('result_reviews')
          .select('id')
          .where('gameweek_id', '=', final.id)
          .where('status', '=', 'open')
          .executeTakeFirst();
        const missingResult = await tx
          .selectFrom('entry_snapshots as locks')
          .leftJoin('entry_results as results', (join) =>
            join
              .onRef('results.entry_id', '=', 'locks.entry_id')
              .onRef('results.gameweek_id', '=', 'locks.gameweek_id')
              .on('results.revision', '=', final.resultRevision),
          )
          .select('locks.entry_id')
          .where('locks.gameweek_id', '=', final.id)
          .where((eb) =>
            eb.or([
              eb('results.entry_id', 'is', null),
              eb(
                sql<boolean>`coalesce((results.payload->>'settled')::boolean, false)`,
                '=',
                false,
              ),
            ]),
          )
          .executeTakeFirst();
        winnersHeld =
          !!missingResult ||
          !!reviews ||
          !inputs.settled ||
          !recorded?.payload.settled ||
          recorded.payload.fingerprint !== inputs.fingerprint;
      }
      const roundStandings =
        final && !winnersHeld
          ? await standingsWithinTransaction(tx, competition, {
              fromRound: final.number,
              throughRound: final.number,
              scoredOnly: true,
            })
          : [];
      const winners = roundStandings.filter((r) => r.rank === 1);
      const selected =
        winners.find((r) => r.entryId === featuredEntryId) ??
        winners[0] ??
        null;
      const lineup =
        final && selected
          ? await publishedLineupWithinTransaction(tx, final, selected.entryId)
          : null;
      const lastPublished = latest
        ? await tx
            .selectFrom('entry_results')
            .select((eb) =>
              eb.fn.max<Date | null>('published_at').as('publishedAt'),
            )
            .where('gameweek_id', '=', latest.id)
            .where('revision', '=', latest.resultRevision)
            .executeTakeFirst()
        : null;
      const checked = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (!checked) throw new Error('Database clock unavailable');
      return {
        competition: {
          id: competition.id,
          slug: competition.slug,
          name: competition.name,
        },
        synthetic: row.season.synthetic,
        checkedAt: checked.toISOString(),
        publishedAt: lastPublished?.publishedAt?.toISOString() ?? null,
        latest: latest
          ? { id: latest.id, name: latest.name, status: latest.status }
          : null,
        standings,
        finalRound: final ? { id: final.id, name: final.name } : null,
        winnersHeld,
        winners: winners.map((r) => ({
          entryId: r.entryId,
          name: r.name,
          points: r.points,
        })),
        selectedEntryId: selected?.entryId ?? null,
        lineup,
      };
    });
}
/** Same canonical ranking kernel for the full round table, including negative scores and sporting ties. */
export async function readPublicRoundStandings(
  db: ReturnType<typeof createDatabase>,
  slug: string,
  gameweekId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const competition = (
        await tx
          .selectFrom('competitions')
          .select('data')
          .where('slug', '=', slug)
          .executeTakeFirst()
      )?.data;
      if (
        !competition ||
        !['published', 'running', 'completed'].includes(competition.status)
      )
        throw new AccessDenied();
      const round = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', gameweekId)
          .where('competition_id', '=', competition.id)
          .executeTakeFirst()
      )?.data;
      if (!round || round.resultRevision < 1) throw new AccessDenied();
      return {
        round,
        standings: await standingsWithinTransaction(tx, competition, {
          fromRound: round.number,
          throughRound: round.number,
          scoredOnly: true,
        }),
      };
    });
}
