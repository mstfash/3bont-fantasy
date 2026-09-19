import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  headToHeadCommandSchema,
  headToHeadCommandResultSchema,
  headToHeadEditionSchema,
  type HeadToHeadCommand,
  type HeadToHeadEdition,
} from '@fantasy/contracts';
import { scheduleHeadToHead } from '@fantasy/domain';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { withdrawEditionEntry } from './head-to-head-withdrawal.ts';
export async function executeHeadToHeadCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: HeadToHeadCommand,
) {
  if (!principal.emailVerified) throw new AccessDenied();
  const command = headToHeadCommandSchema.parse(input);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const receipt = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return headToHeadCommandResultSchema.parse(receipt.result);
    }
    const competition = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forShare()
      .executeTakeFirst();
    if (
      !competition ||
      !['published', 'running', 'completed'].includes(competition.data.status)
    )
      throw new CommandRejected('competition-unavailable');
    const account = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!account) throw new AccessDenied();
    const group = await tx
      .selectFrom('league_groups')
      .select('data')
      .where('id', '=', command.groupId)
      .where('competition_id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!group) throw new CommandRejected('group-unavailable');
    const clock = await sql<{
      now: Date;
    }>`SELECT clock_timestamp() AS now`.execute(tx);
    const now = clock.rows[0]?.now;
    if (
      !now ||
      account.closed_at !== null ||
      (account.suspended_until && account.suspended_until > now)
    )
      throw new AccessDenied();
    const organizer = group.data.organizerId === principal.accountId;
    if (
      ['create', 'open-registration', 'publish'].includes(command.kind) &&
      !organizer
    )
      throw new AccessDenied();
    let edition: HeadToHeadEdition;
    if (command.kind === 'create') {
      const rounds = await tx
        .selectFrom('gameweeks')
        .select(['id', 'deadline', 'data'])
        .where('competition_id', '=', command.competitionId)
        .where('id', 'in', command.gameweekIds)
        .orderBy('number')
        .execute();
      if (
        rounds.length !== command.gameweekIds.length ||
        rounds.some((g) => g.deadline <= now || g.data.status !== 'upcoming')
      )
        throw new CommandRejected('edition-rounds-must-be-unlocked');
      const unfinished = await tx
        .selectFrom('h2h_editions')
        .select('id')
        .where('group_id', '=', command.groupId)
        .where(sql<string>`data->>'status'`, '!=', 'published')
        .limit(5)
        .execute();
      if (unfinished.length >= 5)
        throw new CommandRejected('edition-draft-limit');
      edition = headToHeadEditionSchema.parse({
        id: randomUUID(),
        groupId: command.groupId,
        competitionId: command.competitionId,
        name: command.name,
        status: 'draft',
        revision: 1,
        gameweekIds: rounds.map((g) => g.id),
        seed: randomBytes(16).toString('hex'),
        tieBreak: command.tieBreak,
        tablePoints: command.tablePoints,
        createdAt: now.toISOString(),
        publishedAt: null,
        schedule: [],
      });
      await tx
        .insertInto('h2h_editions')
        .values({
          id: edition.id,
          group_id: edition.groupId,
          competition_id: edition.competitionId,
          revision: 1,
          data: edition,
        })
        .execute();
    } else {
      const row = await tx
        .selectFrom('h2h_editions')
        .select('data')
        .where('id', '=', command.editionId)
        .where('group_id', '=', command.groupId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new CommandRejected('edition-unavailable');
      edition = headToHeadEditionSchema.parse(row.data);
      if (
        'expectedRevision' in command &&
        edition.revision !== command.expectedRevision
      )
        throw new CommandRejected('edition-changed');
      const rounds = await tx
        .selectFrom('gameweeks')
        .select(['id', 'deadline', 'data'])
        .where('id', 'in', edition.gameweekIds)
        .orderBy('number')
        .execute();
      if (
        command.kind !== 'withdraw' &&
        rounds.some((g) => g.deadline <= now || g.data.status !== 'upcoming')
      )
        throw new CommandRejected('edition-deadline-passed');
      if (command.kind === 'open-registration') {
        if (edition.status !== 'draft')
          throw new CommandRejected('edition-not-draft');
        edition = { ...edition, status: 'registration' };
      } else if (command.kind === 'register') {
        if (edition.status !== 'registration')
          throw new CommandRejected('edition-registration-closed');
        const membership = await tx
          .selectFrom('group_memberships')
          .innerJoin('entries', 'entries.id', 'group_memberships.entry_id')
          .select('entries.data')
          .where('group_id', '=', command.groupId)
          .where('entry_id', '=', command.entryId)
          .where('group_memberships.account_id', '=', principal.accountId)
          .where('group_memberships.status', '=', 'active')
          .forShare('entries')
          .executeTakeFirst();
        if (!membership || membership.data.status !== 'active')
          throw new AccessDenied();
        const roster = await tx
          .selectFrom('h2h_registrations')
          .select('entry_id')
          .where('edition_id', '=', edition.id)
          .execute();
        if (roster.length >= 200)
          throw new CommandRejected('edition-roster-limit');
        if (roster.some((r) => r.entry_id === command.entryId))
          throw new CommandRejected('already-registered');
        await tx
          .insertInto('h2h_registrations')
          .values({
            edition_id: edition.id,
            competition_id: edition.competitionId,
            entry_id: command.entryId,
            registered_at: now,
          })
          .execute();
      } else if (command.kind === 'withdraw') {
        const entry = await tx
          .selectFrom('h2h_registrations')
          .innerJoin('entries', 'entries.id', 'h2h_registrations.entry_id')
          .select('entries.account_id')
          .where('edition_id', '=', edition.id)
          .where('entry_id', '=', command.entryId)
          .executeTakeFirst();
        if (!entry || entry.account_id !== principal.accountId)
          throw new AccessDenied();
        await withdrawEditionEntry(
          tx,
          edition,
          command.entryId,
          now,
          'Participant withdrew from edition',
        );
      } else {
        if (edition.status !== 'registration')
          throw new CommandRejected('edition-registration-closed');
        const roster = await tx
          .selectFrom('h2h_registrations')
          .innerJoin('group_memberships', (join) =>
            join
              .onRef(
                'group_memberships.entry_id',
                '=',
                'h2h_registrations.entry_id',
              )
              .on('group_memberships.group_id', '=', edition.groupId),
          )
          .innerJoin('entries', 'entries.id', 'h2h_registrations.entry_id')
          .select([
            'h2h_registrations.entry_id',
            'group_memberships.status',
            'entries.data',
          ])
          .where('edition_id', '=', edition.id)
          .orderBy('h2h_registrations.entry_id')
          .forShare('entries')
          .execute();
        const ids = roster.map((r) => r.entry_id);
        if (
          ids.length < 2 ||
          JSON.stringify(ids) !==
            JSON.stringify([...command.expectedRoster].sort()) ||
          roster.some(
            (r) => r.status !== 'active' || r.data.status !== 'active',
          )
        )
          throw new CommandRejected('edition-roster-changed');
        const schedule = scheduleHeadToHead(
          ids,
          edition.gameweekIds,
          edition.seed,
        );
        if (schedule.length === 0)
          throw new CommandRejected('edition-needs-complete-cycle');
        const usedIds = new Set(schedule.map((f) => f.gameweekId));
        edition = {
          ...edition,
          status: 'published',
          publishedAt: now.toISOString(),
          gameweekIds: edition.gameweekIds.filter((id) => usedIds.has(id)),
          schedule: [...schedule],
        };
      }
      edition = { ...edition, revision: edition.revision + 1 };
      await tx
        .updateTable('h2h_editions')
        .set({ revision: edition.revision, data: edition })
        .where('id', '=', edition.id)
        .execute();
    }
    // Recheck after roster/schedule work: a request waiting across the cutoff cannot publish or enter.
    if (command.kind !== 'withdraw') {
      const late = await tx
        .selectFrom('gameweeks')
        .select('id')
        .where('id', 'in', edition.gameweekIds)
        .where('deadline', '<=', sql<Date>`clock_timestamp()`)
        .executeTakeFirst();
      if (late) throw new CommandRejected('edition-deadline-passed');
    }
    const result = { editionId: edition.id, revision: edition.revision };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `h2h.${command.kind}`,
        scope_id: edition.id,
        reason: null,
        payload: {
          revision: edition.revision,
          entryId: 'entryId' in command ? command.entryId : null,
          roster: 'expectedRoster' in command ? command.expectedRoster : null,
        },
      })
      .execute();
    return result;
  });
}
