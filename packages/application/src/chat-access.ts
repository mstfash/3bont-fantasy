import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { defaultChatSettings } from '@fantasy/contracts';
import {
  AccessDenied,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
/** Locks follow membership commands: competition, actor, group. Every request checks current membership. */
export async function loadChatAccess(
  tx: Transaction<Database>,
  principal: Principal,
  competitionId: string,
  groupId: string,
  write: boolean,
  moderation: readonly StaffGrant[] | null = null,
) {
  if (!principal.emailVerified) throw new AccessDenied();
  const competition = await tx
    .selectFrom('competitions')
    .select('data')
    .where('id', '=', competitionId)
    .forShare()
    .executeTakeFirst();
  if (
    !competition ||
    !['published', 'running', 'completed'].includes(competition.data.status)
  )
    throw new AccessDenied();
  let accountQuery = tx
    .selectFrom('accounts')
    .select(['suspended_until', 'closed_at'])
    .where('id', '=', principal.accountId);
  accountQuery = write ? accountQuery.forUpdate() : accountQuery.forShare();
  const account = await accountQuery.executeTakeFirst();
  let groupQuery = tx
    .selectFrom('league_groups')
    .select('data')
    .where('id', '=', groupId)
    .where('competition_id', '=', competitionId);
  groupQuery = write ? groupQuery.forUpdate() : groupQuery.forShare();
  const group = await groupQuery.executeTakeFirst();
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (
    !account ||
    !group ||
    !now ||
    account.closed_at !== null ||
    (account.suspended_until && account.suspended_until > now)
  )
    throw new AccessDenied();
  const member = await tx
    .selectFrom('group_memberships')
    .select('entry_id')
    .where('group_id', '=', groupId)
    .where('account_id', '=', principal.accountId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (moderation !== null) {
    if (group.data.organizerId !== principal.accountId || !member)
      requireCapability(
        principal,
        moderation,
        'moderation.manage',
        competitionId,
        now,
        write,
      );
  } else if (!member) throw new AccessDenied();
  const settings =
    (
      await tx
        .selectFrom('chat_settings')
        .select('data')
        .where('group_id', '=', groupId)
        .executeTakeFirst()
    )?.data ?? defaultChatSettings;
  return {
    group: group.data,
    now,
    settings,
    canModerate:
      group.data.organizerId === principal.accountId && Boolean(member),
  };
}
export async function currentChatMessage(
  tx: Transaction<Database>,
  groupId: string,
  messageId: string,
  now: Date,
) {
  const row = await tx
    .selectFrom('chat_messages')
    .selectAll()
    .where('id', '=', messageId)
    .where('group_id', '=', groupId)
    .where('created_at', '>', new Date(now.getTime() - 90 * 86400_000))
    .executeTakeFirst();
  if (!row) throw new CommandRejected('chat-message-unavailable');
  return row;
}
