import { withdrawGroupEditions } from './head-to-head-withdrawal.ts';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionSchema,
  groupCommandSchema,
  groupCommandResultSchema,
  leagueGroupSchema,
  type GroupCommand,
  type GroupCommandResult,
  type LeagueGroup,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export async function executeGroupCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: GroupCommand,
): Promise<GroupCommandResult> {
  if (!principal.emailVerified) throw new AccessDenied();
  const command = groupCommandSchema.parse(input);
  const fingerprint = hash(JSON.stringify(command));
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
      return groupCommandResultSchema.parse(receipt.result);
    }
    const row = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forShare()
      .executeTakeFirst();
    if (!row) throw new CommandRejected('competition-unavailable');
    const competition = competitionSchema.parse(row.data);
    if (!['published', 'running', 'completed'].includes(competition.status))
      throw new CommandRejected('competition-unavailable');
    const account = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    const clock = await sql<{
      now: Date;
    }>`SELECT clock_timestamp() AS now`.execute(tx);
    const now = clock.rows[0]?.now;
    if (
      !now ||
      !account ||
      account.closed_at !== null ||
      (account.suspended_until && account.suspended_until > now)
    )
      throw new AccessDenied();
    let group: LeagueGroup;
    let membership: GroupCommandResult['membership'] = null;
    if (command.kind === 'create') {
      if (command.entryLimit > competition.entryLimit)
        throw new CommandRejected('group-entry-limit-exceeds-competition');
      const owned = await tx
        .selectFrom('league_groups')
        .select('id')
        .where('organizer_id', '=', principal.accountId)
        .limit(20)
        .execute();
      if (owned.length >= 20)
        throw new CommandRejected('organizer-group-limit');
      if (command.startGameweekId) {
        const start = await tx
          .selectFrom('gameweeks')
          .select(['deadline', 'data'])
          .where('id', '=', command.startGameweekId)
          .where('competition_id', '=', competition.id)
          .executeTakeFirst();
        if (!start || start.deadline <= now || start.data.status !== 'upcoming')
          throw new CommandRejected('group-start-must-be-unlocked');
      }
      const entry = await tx
        .selectFrom('entries')
        .select('data')
        .where('id', '=', command.entryId)
        .where('competition_id', '=', competition.id)
        .where('account_id', '=', principal.accountId)
        .forShare()
        .executeTakeFirst();
      if (!entry || entry.data.status !== 'active')
        throw new CommandRejected('active-owned-entry-required');
      group = leagueGroupSchema.parse({
        id: randomUUID(),
        competitionId: competition.id,
        organizerId: principal.accountId,
        name: command.name,
        description: command.description,
        visibility: command.visibility,
        approvalRequired: command.approvalRequired,
        entryLimit: command.entryLimit,
        startGameweekId: command.startGameweekId,
        revision: 1,
        createdAt: now.toISOString(),
      });
      await tx
        .insertInto('league_groups')
        .values({
          id: group.id,
          competition_id: group.competitionId,
          organizer_id: group.organizerId,
          invitation_hash: hash(command.invitationToken),
          revision: 1,
          data: group,
        })
        .execute();
      await tx
        .insertInto('group_memberships')
        .values({
          group_id: group.id,
          competition_id: competition.id,
          entry_id: entry.data.id,
          account_id: principal.accountId,
          status: 'active',
          joined_at: now,
          changed_at: now,
        })
        .execute();
      membership = 'active';
    } else {
      const found = await tx
        .selectFrom('league_groups')
        .selectAll()
        .where('id', '=', command.groupId)
        .where('competition_id', '=', competition.id)
        .forUpdate()
        .executeTakeFirst();
      if (!found) throw new CommandRejected('group-unavailable');
      group = leagueGroupSchema.parse(found.data);
      if (command.kind === 'rotate-invitation') {
        if (group.organizerId !== principal.accountId) throw new AccessDenied();
        if (group.revision !== command.expectedRevision)
          throw new CommandRejected('group-changed');
        group = { ...group, revision: group.revision + 1 };
        await tx
          .updateTable('league_groups')
          .set({
            invitation_hash: hash(command.invitationToken),
            revision: group.revision,
            data: group,
          })
          .where('id', '=', group.id)
          .execute();
      } else {
        const current = await tx
          .selectFrom('group_memberships')
          .selectAll()
          .where('group_id', '=', group.id)
          .where('entry_id', '=', command.entryId)
          .executeTakeFirst();
        if (command.kind === 'join') {
          if (
            group.visibility === 'private' &&
            group.organizerId !== principal.accountId &&
            (!command.invitationToken ||
              !timingSafeEqual(
                Buffer.from(hash(command.invitationToken), 'hex'),
                Buffer.from(found.invitation_hash, 'hex'),
              ))
          )
            throw new AccessDenied();
          const entry = await tx
            .selectFrom('entries')
            .select('data')
            .where('id', '=', command.entryId)
            .where('competition_id', '=', competition.id)
            .where('account_id', '=', principal.accountId)
            .forShare()
            .executeTakeFirst();
          if (!entry || entry.data.status !== 'active')
            throw new CommandRejected('active-owned-entry-required');
          if (
            current &&
            ['active', 'pending', 'removed'].includes(current.status)
          )
            throw new CommandRejected(
              current.status === 'removed'
                ? 'membership-removed'
                : 'already-joined',
            );
          const memberships = await tx
            .selectFrom('group_memberships')
            .select('entry_id')
            .where('group_id', '=', group.id)
            .where('account_id', '=', principal.accountId)
            .where('status', 'in', ['active', 'pending'])
            .execute();
          if (memberships.length >= group.entryLimit)
            throw new CommandRejected('group-entry-limit');
          membership =
            group.approvalRequired && group.organizerId !== principal.accountId
              ? 'pending'
              : 'active';
          await tx
            .insertInto('group_memberships')
            .values({
              group_id: group.id,
              competition_id: competition.id,
              entry_id: entry.data.id,
              account_id: principal.accountId,
              status: membership,
              joined_at: now,
              changed_at: now,
            })
            .onConflict((oc) =>
              oc.columns(['group_id', 'entry_id']).doUpdateSet({
                status: membership ?? 'pending',
                joined_at: now,
                changed_at: now,
              }),
            )
            .execute();
        } else if (command.kind === 'leave') {
          if (
            !current ||
            current.account_id !== principal.accountId ||
            !['active', 'pending'].includes(current.status)
          )
            throw new AccessDenied();
          if (group.organizerId === principal.accountId) {
            const retained = await tx
              .selectFrom('group_memberships')
              .select('entry_id')
              .where('group_id', '=', group.id)
              .where('account_id', '=', principal.accountId)
              .where('status', '=', 'active')
              .where('entry_id', '!=', command.entryId)
              .executeTakeFirst();
            if (!retained)
              throw new CommandRejected('organizer-must-retain-membership');
          }
          membership = 'left';
          await tx
            .updateTable('group_memberships')
            .set({ status: membership, changed_at: now })
            .where('group_id', '=', group.id)
            .where('entry_id', '=', command.entryId)
            .execute();
        } else {
          if (group.organizerId !== principal.accountId)
            throw new AccessDenied();
          if (!current || current.status !== command.expectedStatus)
            throw new CommandRejected('membership-changed');
          if (current.account_id === principal.accountId)
            throw new CommandRejected('organizer-must-retain-membership');
          if (command.decision === 'approve' && current.status !== 'pending')
            throw new CommandRejected('membership-not-pending');
          if (
            command.decision === 'remove' &&
            !['active', 'pending'].includes(current.status)
          )
            throw new CommandRejected('membership-not-current');
          membership = command.decision === 'approve' ? 'active' : 'removed';
          await tx
            .updateTable('group_memberships')
            .set({ status: membership, changed_at: now })
            .where('group_id', '=', group.id)
            .where('entry_id', '=', command.entryId)
            .execute();
        }
      }
    }
    const acceptedAt = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!acceptedAt) throw new Error('Database clock unavailable');
    if (
      (membership === 'left' || membership === 'removed') &&
      'entryId' in command
    )
      await withdrawGroupEditions(tx, group.id, command.entryId, acceptedAt);
    if (membership !== null && 'entryId' in command)
      await tx
        .insertInto('group_membership_history')
        .values({
          group_id: group.id,
          entry_id: command.entryId,
          status: membership,
          occurred_at: acceptedAt,
        })
        .execute();
    const result = { groupId: group.id, revision: group.revision, membership };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: acceptedAt,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `group.${command.kind}`,
        scope_id: group.id,
        reason: command.kind === 'review-member' ? command.reason : null,
        payload: {
          entryId: 'entryId' in command ? command.entryId : null,
          membership,
          revision: group.revision,
        },
      })
      .execute();
    return result;
  });
}
