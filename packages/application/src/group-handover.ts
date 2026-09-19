import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  groupHandoverCommandSchema,
  groupHandoverResultSchema,
  groupHandoverSchema,
  leagueGroupSchema,
  type GroupHandoverCommand,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';

export async function executeGroupHandover(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: GroupHandoverCommand,
) {
  if (!principal.emailVerified) throw new AccessDenied();
  const command = groupHandoverCommandSchema.parse(input),
    fingerprint = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
  return db.transaction().execute(async (tx) => {
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
    const actor = await tx
      .selectFrom('accounts')
      .select(['suspended_until', 'closed_at'])
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    const row = await tx
      .selectFrom('league_groups')
      .select('data')
      .where('id', '=', command.groupId)
      .where('competition_id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (
      !actor ||
      !now ||
      actor.closed_at !== null ||
      (actor.suspended_until && actor.suspended_until > now)
    )
      throw new AccessDenied();
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return groupHandoverResultSchema.parse(cached.result);
    }
    if (!row) throw new CommandRejected('group-unavailable');
    let group = leagueGroupSchema.parse(row.data);
    if (group.revision !== command.expectedRevision)
      throw new CommandRejected('group-changed');
    let offerId: string | null = null;
    if (command.kind === 'offer') {
      if (group.organizerId !== principal.accountId) throw new AccessDenied();
      const recipient = await tx
        .selectFrom('group_memberships')
        .innerJoin('entries', 'entries.id', 'group_memberships.entry_id')
        .innerJoin('accounts', 'accounts.id', 'group_memberships.account_id')
        .select([
          'accounts.id',
          'accounts.suspended_until',
          'accounts.closed_at',
          'entries.data',
        ])
        .where('group_memberships.group_id', '=', group.id)
        .where('group_memberships.entry_id', '=', command.recipientEntryId)
        .where('group_memberships.status', '=', 'active')
        .executeTakeFirst();
      if (
        !recipient ||
        recipient.id === principal.accountId ||
        recipient.data.status !== 'active' ||
        recipient.closed_at !== null ||
        (recipient.suspended_until && recipient.suspended_until > now)
      )
        throw new CommandRejected('handover-recipient-unavailable');
      offerId = randomUUID();
      const offer = {
        group_id: group.id,
        id: offerId,
        from_account_id: principal.accountId,
        to_account_id: recipient.id,
        recipient_entry_id: command.recipientEntryId,
        group_revision: group.revision,
        created_at: now,
        expires_at: new Date(now.getTime() + 7 * 86400000),
      };
      await tx
        .insertInto('group_handovers')
        .values(offer)
        .onConflict((oc) => oc.column('group_id').doUpdateSet(offer))
        .execute();
    } else {
      const offer = await tx
        .selectFrom('group_handovers')
        .selectAll()
        .where('group_id', '=', group.id)
        .executeTakeFirst();
      if (
        !offer ||
        offer.id !== command.offerId ||
        offer.from_account_id !== group.organizerId
      )
        throw new CommandRejected('handover-changed');
      if (
        command.kind === 'cancel'
          ? group.organizerId !== principal.accountId
          : offer.to_account_id !== principal.accountId
      )
        throw new AccessDenied();
      if (command.kind === 'accept') {
        if (offer.expires_at <= now || offer.group_revision !== group.revision)
          throw new CommandRejected('handover-expired-or-changed');
        const member = await tx
          .selectFrom('group_memberships')
          .innerJoin('entries', 'entries.id', 'group_memberships.entry_id')
          .select('entries.data')
          .where('group_memberships.group_id', '=', group.id)
          .where('group_memberships.entry_id', '=', offer.recipient_entry_id)
          .where('group_memberships.account_id', '=', principal.accountId)
          .where('group_memberships.status', '=', 'active')
          .executeTakeFirst();
        if (!member || member.data.status !== 'active')
          throw new CommandRejected('handover-recipient-unavailable');
        const owned = await tx
          .selectFrom('league_groups')
          .select('id')
          .where('organizer_id', '=', principal.accountId)
          .limit(20)
          .execute();
        if (owned.length >= 20)
          throw new CommandRejected('organizer-group-limit');
        group = {
          ...group,
          organizerId: principal.accountId,
          revision: group.revision + 1,
        };
        await tx
          .updateTable('league_groups')
          .set({
            organizer_id: group.organizerId,
            revision: group.revision,
            data: group,
            invitation_hash: createHash('sha256')
              .update(randomBytes(32))
              .digest('hex'),
          })
          .where('id', '=', group.id)
          .execute();
      }
      await tx
        .deleteFrom('group_handovers')
        .where('group_id', '=', group.id)
        .execute();
    }
    const result = {
      groupId: group.id,
      revision: group.revision,
      organizerId: group.organizerId,
      offerId,
    };
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
        action: `group.handover.${command.kind}`,
        scope_id: group.id,
        reason: null,
        payload: {
          ...result,
          reviewedOfferId: command.kind === 'offer' ? offerId : command.offerId,
        },
      })
      .execute();
    return result;
  });
}
export async function groupHandoverWithinTransaction(
  tx: Transaction<Database>,
  groupId: string,
  viewerId: string | null,
) {
  if (!viewerId) return null;
  const row = await tx
    .selectFrom('group_handovers')
    .selectAll()
    .where('group_id', '=', groupId)
    .where((eb) =>
      eb.or([
        eb('from_account_id', '=', viewerId),
        eb('to_account_id', '=', viewerId),
      ]),
    )
    .where('expires_at', '>', sql<Date>`clock_timestamp()`)
    .executeTakeFirst();
  return row
    ? groupHandoverSchema.parse({
        id: row.id,
        groupId: row.group_id,
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
        recipientEntryId: row.recipient_entry_id,
        groupRevision: row.group_revision,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
      })
    : null;
}
export async function purgeGroupHandovers(
  db: ReturnType<typeof createDatabase>,
) {
  await db
    .deleteFrom('group_handovers')
    .where('expires_at', '<=', sql<Date>`clock_timestamp()`)
    .execute();
}
