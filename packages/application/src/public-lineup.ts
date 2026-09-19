import type { Transaction } from 'kysely';
import type { Database, createDatabase } from '@fantasy/persistence';
import { AccessDenied } from './authorization.ts';
import {
  clubSchema,
  footballerSchema,
  entryResultSchema,
  type Gameweek,
} from '@fantasy/contracts';
import { readPublishedSnapshot } from './entry-snapshots.ts';

/** Caller has authorized a public competition. Only published results and the corresponding immutable lock are read. */
export async function publishedLineupWithinTransaction(
  tx: Transaction<Database>,
  round: Gameweek,
  entryId: string,
) {
  const resultRow = await tx
    .selectFrom('entry_results')
    .select('payload')
    .where('entry_id', '=', entryId)
    .where('competition_id', '=', round.competitionId)
    .where('gameweek_id', '=', round.id)
    .where('revision', '=', round.resultRevision)
    .executeTakeFirst();
  if (!resultRow) return null;
  const locked = await readPublishedSnapshot(
    tx,
    entryId,
    round.id,
    round.resultRevision,
  );
  if (!locked) return null;
  const result = entryResultSchema.parse(resultRow.payload);
  const ids = locked.roster.holdings.map((h) => h.footballerId);
  const catalogue = ids.length
    ? await tx
        .selectFrom('footballers')
        .innerJoin('clubs', 'clubs.id', 'footballers.club_id')
        .select(['footballers.data as player', 'clubs.data as club'])
        .where('footballers.id', 'in', ids)
        .execute()
    : [];
  const byId = new Map(
    catalogue.map((r) => {
      const player = footballerSchema.parse(r.player);
      return [player.id, { player, club: clubSchema.parse(r.club) }] as const;
    }),
  );
  const players = result.players.map((p) => {
    const meta = byId.get(p.footballerId);
    return {
      id: p.footballerId,
      name: meta?.player.name ?? {
        en: 'Unknown footballer',
        ar: 'لاعب غير معروف',
      },
      position: p.position,
      shirtNumber: meta?.player.shirtNumber ?? null,
      color: meta?.club.color ?? '#888888',
      club: meta?.club.shortName ?? '—',
      points: p.points,
      counted: result.effectiveIds.includes(p.footballerId),
      captain: result.captainId === p.footballerId,
    };
  });
  // Bench Boost counts the bench without turning a valid XI into a 15-player formation.
  const pitchIds =
    locked.chip === 'bench-boost'
      ? locked.roster.starterIds
      : result.effectiveIds;
  return {
    result,
    players,
    pitchIds,
    benchIds: ids.filter((id) => !pitchIds.includes(id)),
    total: result.total,
    playersTotal: result.playersTotal,
    captainExtra: result.captainExtra,
    transferDeduction: result.transferDeduction,
    chip: locked.chip,
    settled: result.settled,
  };
}

export async function readPublicLineup(
  db: ReturnType<typeof createDatabase>,
  slug: string,
  entryId: string,
  gameweekId?: string,
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
      const entry = (
        await tx
          .selectFrom('entries')
          .select('data')
          .where('id', '=', entryId)
          .where('competition_id', '=', competition.id)
          .executeTakeFirst()
      )?.data;
      const snapshot = await tx
        .selectFrom('entry_snapshots')
        .innerJoin('gameweeks', 'gameweeks.id', 'entry_snapshots.gameweek_id')
        .select('gameweeks.data')
        .where('entry_snapshots.entry_id', '=', entryId)
        .where('entry_snapshots.competition_id', '=', competition.id)
        .$if(gameweekId !== undefined, (q) =>
          q.where('gameweeks.id', '=', gameweekId ?? ''),
        )
        .orderBy('gameweeks.number', 'desc')
        .executeTakeFirst();
      if (!entry || !snapshot) throw new AccessDenied();
      return {
        entry: { id: entry.id, name: entry.name },
        round: snapshot.data,
        lineup: await publishedLineupWithinTransaction(
          tx,
          snapshot.data,
          entryId,
        ),
      };
    });
}
