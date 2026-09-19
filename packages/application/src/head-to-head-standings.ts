import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  entryResultSchema,
  type Gameweek,
  type HeadToHeadEdition,
  type EntryResult,
} from '@fantasy/contracts';
import { pointUnits, scoreHeadToHead } from '@fantasy/domain';

export interface HeadToHeadInputs {
  readonly registrations: readonly {
    id: string;
    accountId: string;
    name: string;
  }[];
  readonly rounds: readonly Pick<
    Gameweek,
    'id' | 'name' | 'status' | 'resultRevision' | 'deadline'
  >[];
  readonly forfeits: readonly { entryId: string; gameweekId: string }[];
  readonly scores: readonly {
    entryId: string;
    gameweekId: string;
    total: EntryResult['total'];
  }[];
}

/** Caller supplies one consistent snapshot or holds the parent competition barrier. */
export async function loadHeadToHeadInputs(
  tx: Transaction<Database>,
  edition: HeadToHeadEdition,
) {
  const [registrations, rounds, forfeits, results] = await Promise.all([
    tx
      .selectFrom('h2h_registrations')
      .innerJoin('entries', 'entries.id', 'h2h_registrations.entry_id')
      .select(['entries.id', 'entries.account_id', 'entries.data'])
      .where('edition_id', '=', edition.id)
      .orderBy('entries.id')
      .execute(),
    tx
      .selectFrom('gameweeks')
      .select('data')
      .where('id', 'in', edition.gameweekIds)
      .orderBy('number')
      .execute(),
    tx
      .selectFrom('h2h_forfeits')
      .select(['entry_id', 'gameweek_id'])
      .where('edition_id', '=', edition.id)
      .orderBy('entry_id')
      .orderBy('gameweek_id')
      .execute(),
    tx
      .selectFrom('entry_results')
      .innerJoin('gameweeks', 'gameweeks.id', 'entry_results.gameweek_id')
      .innerJoin(
        'h2h_registrations',
        'h2h_registrations.entry_id',
        'entry_results.entry_id',
      )
      .select([
        'entry_results.entry_id',
        'entry_results.gameweek_id',
        'entry_results.payload',
      ])
      .where('h2h_registrations.edition_id', '=', edition.id)
      .where('entry_results.gameweek_id', 'in', edition.gameweekIds)
      .whereRef(
        'entry_results.revision',
        '=',
        sql<number>`(gameweeks.data->>'resultRevision')::integer`,
      )
      .orderBy('entry_results.entry_id')
      .orderBy('entry_results.gameweek_id')
      .execute(),
  ]);
  return {
    registrations: registrations.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.data.name,
    })),
    rounds: rounds.map((r) => r.data),
    forfeits: forfeits.map((f) => ({
      entryId: f.entry_id,
      gameweekId: f.gameweek_id,
    })),
    scores: results.map((r) => ({
      entryId: r.entry_id,
      gameweekId: r.gameweek_id,
      total: entryResultSchema.parse(r.payload).total,
    })),
  };
}

interface HeadToHeadRow {
  entryId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  tablePoints: number;
  fantasyPoints: number;
}
/** The same calculation serves published tables and hypothetical corrections. */
export function calculateHeadToHeadStandings(
  edition: HeadToHeadEdition,
  inputs: HeadToHeadInputs,
) {
  const rounds = new Map(inputs.rounds.map((round) => [round.id, round]));
  const scores = new Map(
    inputs.scores.map((r) => [`${r.entryId}:${r.gameweekId}`, r.total]),
  );
  const forfeited = new Set(
    inputs.forfeits.map((f) => `${f.entryId}:${f.gameweekId}`),
  );
  const rows = new Map<string, HeadToHeadRow>(
    inputs.registrations.map((r) => [
      r.id,
      {
        entryId: r.id,
        name: r.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        tablePoints: 0,
        fantasyPoints: 0,
      },
    ]),
  );
  const matches = edition.schedule.map((fixture) => {
    const round = rounds.get(fixture.gameweekId);
    const home = scores.get(`${fixture.homeId}:${fixture.gameweekId}`);
    const away = fixture.awayId
      ? scores.get(`${fixture.awayId}:${fixture.gameweekId}`)
      : null;
    const homeForfeit = forfeited.has(
      `${fixture.homeId}:${fixture.gameweekId}`,
    );
    const awayForfeit = fixture.awayId
      ? forfeited.has(`${fixture.awayId}:${fixture.gameweekId}`)
      : false;
    const available =
      !!round &&
      round.status !== 'upcoming' &&
      round.resultRevision > 0 &&
      (home !== undefined || homeForfeit) &&
      (away !== undefined || awayForfeit);
    const scored = available
      ? scoreHeadToHead(
          home ?? pointUnits(0),
          fixture.awayId ? (away ?? pointUnits(0)) : null,
          homeForfeit,
          awayForfeit,
        )
      : null;
    if (scored) {
      const add = (id: string, side: 'home' | 'away', value: number) => {
        const row = rows.get(id);
        if (!row) return;
        row.fantasyPoints += value;
        if (scored.outcome === 'bye') return;
        row.played++;
        if (scored.outcome === side) {
          row.wins++;
          row.tablePoints += edition.tablePoints.win;
        } else if (scored.outcome === 'draw') {
          row.draws++;
          row.tablePoints += edition.tablePoints.draw;
        } else {
          row.losses++;
          if (scored.outcome !== 'double-forfeit')
            row.tablePoints += edition.tablePoints.loss;
        }
      };
      add(fixture.homeId, 'home', home ?? 0);
      if (fixture.awayId) add(fixture.awayId, 'away', away ?? 0);
    }
    return {
      ...fixture,
      homeName: rows.get(fixture.homeId)?.name ?? '',
      awayName: fixture.awayId ? (rows.get(fixture.awayId)?.name ?? '') : null,
      homePoints: home ?? null,
      awayPoints: away ?? null,
      homeForfeit,
      awayForfeit,
      outcome: scored?.outcome ?? null,
      final: available && round.status === 'finalized',
      gameweekName: round?.name ?? { ar: '', en: '' },
    };
  });
  const compare = (a: HeadToHeadRow, b: HeadToHeadRow) =>
    b.tablePoints - a.tablePoints ||
    (edition.tieBreak === 'fantasy-points'
      ? b.fantasyPoints - a.fantasyPoints
      : 0);
  const ordered = [...rows.values()].sort(
    (a, b) => compare(a, b) || a.entryId.localeCompare(b.entryId),
  );
  let rank = 1;
  const table = ordered.map((row, index) => {
    const previous = ordered[index - 1];
    if (previous && compare(previous, row) !== 0) rank = index + 1;
    return { ...row, rank };
  });
  return { table, matches };
}
