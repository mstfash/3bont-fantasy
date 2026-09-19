import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  headToHeadEditionSchema,
  leagueGroupSchema,
  entryResultSchema,
} from '@fantasy/contracts';
import { pointUnits, scoreHeadToHead } from '@fantasy/domain';
import { requireGroupReader } from './group-access.ts';
import { AccessDenied } from './authorization.ts';
import { CommandRejected } from './errors.ts';
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
export async function headToHeadDetails(
  db: ReturnType<typeof createDatabase>,
  editionId: string,
  viewerAccountId: string | null,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('h2h_editions')
        .select('data')
        .where('id', '=', editionId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('edition-unavailable');
      const edition = headToHeadEditionSchema.parse(row.data);
      const group = leagueGroupSchema.parse(
        (
          await tx
            .selectFrom('league_groups')
            .select('data')
            .where('id', '=', edition.groupId)
            .executeTakeFirstOrThrow()
        ).data,
      );
      await requireGroupReader(tx, group, viewerAccountId);
      const organizer = group.organizerId === viewerAccountId;
      if (edition.status === 'draft' && !organizer) throw new AccessDenied();
      const competition = (
        await tx
          .selectFrom('competitions')
          .select('data')
          .where('id', '=', edition.competitionId)
          .executeTakeFirstOrThrow()
      ).data;
      if (!['published', 'running', 'completed'].includes(competition.status))
        throw new AccessDenied();
      const [registrations, roundRows, forfeits, resultRows, eligible] =
        await Promise.all([
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
            .execute(),
          viewerAccountId
            ? tx
                .selectFrom('group_memberships')
                .innerJoin(
                  'entries',
                  'entries.id',
                  'group_memberships.entry_id',
                )
                .select(['entries.id', 'entries.data'])
                .where('group_id', '=', group.id)
                .where('group_memberships.account_id', '=', viewerAccountId)
                .where('group_memberships.status', '=', 'active')
                .execute()
            : [],
        ]);
      const rounds = new Map(roundRows.map((r) => [r.data.id, r.data]));
      const scores = new Map(
        resultRows.map((r) => [
          `${r.entry_id}:${r.gameweek_id}`,
          entryResultSchema.parse(r.payload).total,
        ]),
      );
      const forfeited = new Set(
        forfeits.map((f) => `${f.entry_id}:${f.gameweek_id}`),
      );
      const rows = new Map<string, HeadToHeadRow>(
        registrations.map((r) => [
          r.id,
          {
            entryId: r.id,
            name: r.data.name,
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
          awayName: fixture.awayId
            ? (rows.get(fixture.awayId)?.name ?? '')
            : null,
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
      const phase:
        | 'draft'
        | 'registration'
        | 'scheduled'
        | 'active'
        | 'review'
        | 'settled' =
        edition.status !== 'published'
          ? edition.status
          : matches.every((m) => m.final)
            ? 'settled'
            : roundRows.some((r) => r.data.status === 'review')
              ? 'review'
              : roundRows.some(
                    (r) =>
                      r.data.status !== 'upcoming' ||
                      Date.parse(r.data.deadline) <= Date.now(),
                  )
                ? 'active'
                : 'scheduled';
      return {
        edition,
        group,
        competition,
        organizer,
        phase,
        table,
        matches,
        rounds: roundRows.map((r) => r.data),
        roster: registrations.map((r) => ({
          id: r.id,
          name: r.data.name,
          owned: r.account_id === viewerAccountId,
          withdrawn: forfeits.some((f) => f.entry_id === r.id),
        })),
        eligibleEntries: eligible
          .filter(
            (r) =>
              r.data.status === 'active' &&
              !registrations.some((member) => member.id === r.id),
          )
          .map((r) => ({ id: r.id, name: r.data.name })),
      };
    });
}
