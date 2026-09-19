import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  entrySchema,
  entryResultSchema,
  type Competition,
  type EntryResult,
} from '@fantasy/contracts';
import { rankEntries, sumPoints } from '@fantasy/domain';

/** A joined published-revision predicate prevents readers from mixing recalculation versions. */
export async function competitionStandings(
  db: ReturnType<typeof createDatabase>,
  competition: Competition,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      return standingsWithinTransaction(tx, competition);
    });
}
export async function standingsWithinTransaction(
  tx: Transaction<Database>,
  competition: Competition,
  options: {
    readonly entryIds?: readonly string[];
    readonly fromRound?: number;
    /** Hypothetical complete replacement of one round; never writes published scores. */
    readonly replacement?: {
      readonly gameweekId: string;
      readonly number: number;
      readonly results: ReadonlyMap<string, EntryResult>;
    };
  } = {},
) {
  if (options.entryIds?.length === 0) return [];
  const [entryRows, resultRows] = await Promise.all([
    tx
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competition.id)
      .where(sql<string>`data->>'status'`, '!=', 'draft')
      .$if(options.entryIds !== undefined, (query) =>
        query.where('id', 'in', options.entryIds ?? []),
      )
      .execute(),
    tx
      .selectFrom('entry_results')
      .innerJoin('gameweeks', 'gameweeks.id', 'entry_results.gameweek_id')
      .select([
        'entry_results.entry_id',
        'entry_results.payload',
        'gameweeks.data as round',
      ])
      .where('entry_results.competition_id', '=', competition.id)
      .$if(options.entryIds !== undefined, (query) =>
        query.where('entry_results.entry_id', 'in', options.entryIds ?? []),
      )
      .where('gameweeks.number', '>=', options.fromRound ?? 1)
      .whereRef(
        'entry_results.revision',
        '=',
        sql<number>`(gameweeks.data->>'resultRevision')::integer`,
      )
      .execute(),
  ]);
  const entries = entryRows.map((r) => entrySchema.parse(r.data));
  const results = resultRows
    .filter((r) => r.round.id !== options.replacement?.gameweekId)
    .map((r) => ({
      entryId: r.entry_id,
      score: entryResultSchema.parse(r.payload),
      final: r.round.status === 'finalized',
    }));
  if (
    options.replacement &&
    options.replacement.number >= (options.fromRound ?? 1)
  ) {
    const included = new Set(entries.map((entry) => entry.id));
    for (const [entryId, score] of options.replacement.results)
      if (included.has(entryId)) results.push({ entryId, score, final: false });
  }
  const byEntry = new Map<string, typeof results>();
  for (const result of results) {
    const existing = byEntry.get(result.entryId);
    if (existing) existing.push(result);
    else byEntry.set(result.entryId, [result]);
  }
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const ranks = rankEntries(
    entries.map((entry) => {
      const scores = byEntry.get(entry.id) ?? [];
      return {
        entryId: entry.id,
        accountId: entry.accountId,
        points: sumPoints(scores.map((r) => r.score.total)),
        transferDeductions: sumPoints(
          scores.map((r) => r.score.transferDeduction),
        ),
        effectiveGoals: scores.reduce((sum, r) => sum + r.score.goals, 0),
      };
    }),
    competition.rules.ranking,
  );
  return ranks.map((rank) => ({
    ...rank,
    name: entryById.get(rank.entryId)?.name ?? '',
    retired: entryById.get(rank.entryId)?.status === 'retired',
    scoredGameweeks: byEntry.get(rank.entryId)?.length ?? 0,
    provisional: byEntry.get(rank.entryId)?.some((r) => !r.final) ?? false,
  }));
}

/** Publish-safe rank differences shared by overall and classic-group correction previews. */
export function compareStandings(
  before: Awaited<ReturnType<typeof standingsWithinTransaction>>,
  after: Awaited<ReturnType<typeof standingsWithinTransaction>> | null,
) {
  if (after === null) return null;
  const byEntry = new Map(after.map((row) => [row.entryId, row]));
  return before.map((row) => {
    const next = byEntry.get(row.entryId);
    if (!next) throw new Error('Correction preview lost a ranked entry');
    return {
      entryId: row.entryId,
      name: row.name,
      beforeRank: row.rank,
      afterRank: next.rank,
      beforePoints: row.points,
      afterPoints: next.points,
    };
  });
}
