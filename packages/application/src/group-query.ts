import { groupHandoverWithinTransaction } from './group-handover.ts';
import { requireGroupReader } from './group-access.ts';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { leagueGroupSchema, competitionSchema } from '@fantasy/contracts';
import { AccessDenied } from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { standingsWithinTransaction } from './leaderboard.ts';
export async function listLeagueGroups(
  db: ReturnType<typeof createDatabase>,
  competitionId: string,
  viewerAccountId: string | null,
  page = 1,
) {
  return db
    .selectFrom('league_groups')
    .select('data')
    .where('competition_id', '=', competitionId)
    .where((eb) =>
      eb.or([
        sql<boolean>`data->>'visibility'='public'`,
        eb('organizer_id', '=', viewerAccountId ?? ''),
        eb.exists(
          eb
            .selectFrom('group_memberships')
            .select('group_id')
            .whereRef('group_id', '=', 'league_groups.id')
            .where('account_id', '=', viewerAccountId ?? '')
            .where('status', 'in', ['active', 'pending']),
        ),
      ]),
    )
    .orderBy('id')
    .offset((Math.max(1, Math.min(10000, Math.floor(page))) - 1) * 30)
    .limit(31)
    .execute();
}
export async function leagueGroupDetails(
  db: ReturnType<typeof createDatabase>,
  groupId: string,
  viewerAccountId: string | null,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('league_groups')
        .select('data')
        .where('id', '=', groupId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('group-unavailable');
      const group = leagueGroupSchema.parse(row.data);
      await requireGroupReader(tx, group, viewerAccountId);
      const memberships = await tx
        .selectFrom('group_memberships')
        .innerJoin('entries', 'entries.id', 'group_memberships.entry_id')
        .select([
          'group_memberships.entry_id',
          'group_memberships.account_id',
          'group_memberships.status',
          'group_memberships.joined_at',
          'entries.data as entry',
        ])
        .where('group_id', '=', group.id)
        .execute();
      const organizer = group.organizerId === viewerAccountId;
      const own = memberships.filter((m) => m.account_id === viewerAccountId);

      const competition = competitionSchema.parse(
        (
          await tx
            .selectFrom('competitions')
            .select('data')
            .where('id', '=', group.competitionId)
            .executeTakeFirstOrThrow()
        ).data,
      );
      if (!['published', 'running', 'completed'].includes(competition.status))
        throw new AccessDenied();
      const start = group.startGameweekId
        ? await tx
            .selectFrom('gameweeks')
            .select(['number', 'data'])
            .where('id', '=', group.startGameweekId)
            .executeTakeFirstOrThrow()
        : null;
      const standings = await standingsWithinTransaction(tx, competition, {
        entryIds: memberships
          .filter((m) => m.status === 'active')
          .map((m) => m.entry_id),
        fromRound: start?.number ?? 1,
      });
      const editions = await tx
        .selectFrom('h2h_editions')
        .select('data')
        .where('group_id', '=', group.id)
        .orderBy('id')
        .execute();
      const upcoming = organizer
        ? await tx
            .selectFrom('gameweeks')
            .select('data')
            .where('competition_id', '=', competition.id)
            .where('deadline', '>', new Date())
            .orderBy('number')
            .execute()
        : [];
      return {
        editions: editions
          .filter((e) => organizer || e.data.status !== 'draft')
          .map((e) => ({
            id: e.data.id,
            name: e.data.name,
            status: e.data.status,
          })),
        upcomingRounds: upcoming
          .filter((g) => g.data.status === 'upcoming')
          .map((g) => g.data),
        handover: await groupHandoverWithinTransaction(
          tx,
          group.id,
          viewerAccountId,
        ),
        handoverCandidates: organizer
          ? memberships
              .filter(
                (m) =>
                  m.account_id !== viewerAccountId &&
                  m.status === 'active' &&
                  m.entry.status === 'active',
              )
              .map((m) => ({ entryId: m.entry_id, name: m.entry.name }))
          : [],
        group,
        competition,
        startGameweek: start?.data ?? null,
        organizer,
        ownMemberships: own.map((m) => ({
          entryId: m.entry_id,
          name: m.entry.name,
          status: m.status,
        })),
        members: organizer
          ? memberships
              .filter((m) => ['active', 'pending'].includes(m.status))
              .map((m) => ({
                entryId: m.entry_id,
                name: m.entry.name,
                status: m.status,
                isOrganizer: m.account_id === viewerAccountId,
              }))
          : [],
        standings: standings.map((row) => ({
          entryId: row.entryId,
          name: row.name,
          rank: row.rank,
          points: row.points,
          scoredGameweeks: row.scoredGameweeks,
          provisional: row.provisional,
          retired: row.retired,
        })),
      };
    });
}
