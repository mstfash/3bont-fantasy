import type { createDatabase } from '@fantasy/persistence';
import { headToHeadEditionSchema, leagueGroupSchema } from '@fantasy/contracts';
import {
  calculateHeadToHeadStandings,
  loadHeadToHeadInputs,
} from './head-to-head-standings.ts';
import { requireGroupReader } from './group-access.ts';
import { AccessDenied } from './authorization.ts';
import { CommandRejected } from './errors.ts';
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
      const [inputs, eligible] = await Promise.all([
        loadHeadToHeadInputs(tx, edition),
        viewerAccountId
          ? tx
              .selectFrom('group_memberships')
              .innerJoin('entries', 'entries.id', 'group_memberships.entry_id')
              .select(['entries.id', 'entries.data'])
              .where('group_id', '=', group.id)
              .where('group_memberships.account_id', '=', viewerAccountId)
              .where('group_memberships.status', '=', 'active')
              .execute()
          : [],
      ]);
      const { table, matches } = calculateHeadToHeadStandings(edition, inputs);
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
            : inputs.rounds.some((r) => r.status === 'review')
              ? 'review'
              : inputs.rounds.some(
                    (r) =>
                      r.status !== 'upcoming' ||
                      Date.parse(r.deadline) <= Date.now(),
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
        rounds: inputs.rounds,
        roster: inputs.registrations.map((r) => ({
          id: r.id,
          name: r.name,
          owned: r.accountId === viewerAccountId,
          withdrawn: inputs.forfeits.some((f) => f.entryId === r.id),
        })),
        eligibleEntries: eligible
          .filter(
            (r) =>
              r.data.status === 'active' &&
              !inputs.registrations.some((member) => member.id === r.id),
          )
          .map((r) => ({ id: r.id, name: r.data.name })),
      };
    });
}
