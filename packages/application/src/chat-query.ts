import type { createDatabase } from '@fantasy/persistence';
import { chatCursorSchema, chatPageSchema } from '@fantasy/contracts';
import type { Principal, StaffGrant } from './authorization.ts';
import { loadChatAccess } from './chat-access.ts';
export async function readChatPage(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  competitionId: string,
  groupId: string,
  before: string | null = null,
) {
  if (before !== null) chatCursorSchema.parse(before);
  return db.transaction().execute(async (tx) => {
    const access = await loadChatAccess(
      tx,
      principal,
      competitionId,
      groupId,
      false,
    );
    const [blocked, preference, timeout] = await Promise.all([
      tx
        .selectFrom('chat_blocks')
        .innerJoin('accounts', 'accounts.id', 'chat_blocks.blocked_id')
        .select(['blocked_id', 'display_name'])
        .where('account_id', '=', principal.accountId)
        .execute(),
      tx
        .selectFrom('chat_preferences')
        .select('muted')
        .where('group_id', '=', groupId)
        .where('account_id', '=', principal.accountId)
        .executeTakeFirst(),
      tx
        .selectFrom('chat_timeouts')
        .select('until_at')
        .where('group_id', '=', groupId)
        .where('account_id', '=', principal.accountId)
        .where('until_at', '>', access.now)
        .executeTakeFirst(),
    ]);
    let query = tx
      .selectFrom('chat_messages')
      .innerJoin('accounts', 'accounts.id', 'chat_messages.account_id')
      .select([
        'chat_messages.id',
        'sequence',
        'account_id',
        'display_name',
        'body',
        'chat_messages.created_at',
        'removed_at',
      ])
      .where('group_id', '=', groupId)
      .where(
        'chat_messages.created_at',
        '>',
        new Date(access.now.getTime() - 90 * 86400_000),
      );
    if (before) query = query.where('sequence', '<', before);
    if (blocked.length)
      query = query.where(
        'account_id',
        'not in',
        blocked.map((b) => b.blocked_id),
      );
    const rows = access.settings.enabled
      ? await query.orderBy('sequence', 'desc').limit(51).execute()
      : [];
    return chatPageSchema.parse({
      settings: access.settings,
      groupName: access.group.name,
      messages: rows
        .slice(0, 50)
        .reverse()
        .map((m) => ({
          id: m.id,
          sequence: m.sequence,
          accountId: m.account_id,
          displayName: m.display_name,
          body: m.body,
          createdAt: m.created_at.toISOString(),
          removed: m.removed_at !== null,
        })),
      hasOlder: rows.length > 50,
      muted: preference?.muted ?? false,
      blocked: blocked.map((b) => ({
        accountId: b.blocked_id,
        displayName: b.display_name,
      })),
      timeoutUntil: timeout?.until_at.toISOString() ?? null,
      canModerate: access.canModerate,
    });
  });
}
export async function readChatModeration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
  groupId: string,
) {
  return db.transaction().execute(async (tx) => {
    const access = await loadChatAccess(
      tx,
      principal,
      competitionId,
      groupId,
      false,
      grants,
    );
    const reports = await tx
      .selectFrom('chat_reports')
      .selectAll()
      .where('group_id', '=', groupId)
      .where('expires_at', '>', access.now)
      .orderBy('state', 'desc')
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
    const timeouts = await tx
      .selectFrom('chat_timeouts')
      .innerJoin('accounts', 'accounts.id', 'chat_timeouts.account_id')
      .select(['account_id', 'display_name', 'until_at', 'reason'])
      .where('group_id', '=', groupId)
      .where('until_at', '>', access.now)
      .execute();
    const history = await tx
      .selectFrom('chat_moderation_events')
      .selectAll()
      .where('group_id', '=', groupId)
      .where('expires_at', '>', access.now)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    return {
      group: access.group,
      settings: access.settings,
      reports,
      timeouts,
      history,
    };
  });
}
/** Expiry is enforced on reads as well, so a delayed job never extends public retention. */
export async function purgeExpiredChat(db: ReturnType<typeof createDatabase>) {
  return db.transaction().execute(async (tx) => {
    const now = new Date();
    await tx
      .deleteFrom('chat_messages')
      .where('created_at', '<=', new Date(now.getTime() - 90 * 86400_000))
      .execute();
    await tx
      .deleteFrom('chat_moderation_events')
      .where('expires_at', '<=', now)
      .execute();
    await tx
      .deleteFrom('chat_reports')
      .where('expires_at', '<=', now)
      .execute();
    await tx
      .deleteFrom('chat_post_events')
      .where('occurred_at', '<=', new Date(now.getTime() - 3600_000))
      .execute();
    await tx.deleteFrom('chat_timeouts').where('until_at', '<=', now).execute();
  });
}
