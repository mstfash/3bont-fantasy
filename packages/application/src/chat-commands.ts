import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  chatCommandSchema,
  chatCommandResultSchema,
  type ChatCommand,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { loadChatAccess, currentChatMessage } from './chat-access.ts';
export async function executeChatCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: ChatCommand,
) {
  const command = chatCommandSchema.parse(input),
    fingerprint = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
  return db.transaction().execute(async (tx) => {
    const { now, settings } = await loadChatAccess(
      tx,
      principal,
      command.competitionId,
      command.groupId,
      true,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return chatCommandResultSchema.parse(cached.result);
    }
    const result: { messageId: string | null; reportId: string | null } = {
      messageId: null,
      reportId: null,
    };
    switch (command.kind) {
      case 'post': {
        if (!settings.enabled) throw new CommandRejected('chat-disabled');
        if (command.body.length > settings.maximumLength)
          throw new CommandRejected('chat-message-too-long');
        const timeout = await tx
          .selectFrom('chat_timeouts')
          .select('until_at')
          .where('group_id', '=', command.groupId)
          .where('account_id', '=', principal.accountId)
          .executeTakeFirst();
        if (timeout && timeout.until_at > now)
          throw new CommandRejected('chat-timeout');
        const counts = await tx
          .selectFrom('chat_post_events')
          .select([
            sql<string>`count(*)`.as('hour'),
            sql<string>`count(*) FILTER (WHERE occurred_at > ${new Date(now.getTime() - 10_000)})`.as(
              'burst',
            ),
          ])
          .where('account_id', '=', principal.accountId)
          .where('occurred_at', '>', new Date(now.getTime() - 3600_000))
          .executeTakeFirstOrThrow();
        if (
          Number(counts.hour) >= settings.hourlyLimit ||
          Number(counts.burst) >= settings.burstLimit
        )
          throw new CommandRejected('chat-rate-limit');
        result.messageId = randomUUID();
        await tx
          .insertInto('chat_messages')
          .values({
            id: result.messageId,
            group_id: command.groupId,
            account_id: principal.accountId,
            body: command.body,
            created_at: now,
            removed_at: null,
          })
          .execute();
        await tx
          .insertInto('chat_post_events')
          .values({ account_id: principal.accountId, occurred_at: now })
          .execute();
        break;
      }
      case 'delete': {
        const message = await currentChatMessage(
          tx,
          command.groupId,
          command.messageId,
          now,
        );
        if (message.account_id !== principal.accountId)
          throw new AccessDenied();
        await tx
          .updateTable('chat_messages')
          .set({ body: '', removed_at: message.removed_at ?? now })
          .where('id', '=', message.id)
          .execute();
        result.messageId = message.id;
        break;
      }
      case 'report': {
        const message = await currentChatMessage(
          tx,
          command.groupId,
          command.messageId,
          now,
        );
        if (message.account_id === principal.accountId || message.removed_at)
          throw new CommandRejected('chat-report-unavailable');
        const existing = await tx
          .selectFrom('chat_reports')
          .select('id')
          .where('message_id', '=', message.id)
          .where('reporter_id', '=', principal.accountId)
          .executeTakeFirst();
        if (existing) {
          result.reportId = existing.id;
          break;
        }
        const count = await tx
          .selectFrom('chat_reports')
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .where('reporter_id', '=', principal.accountId)
          .where('created_at', '>', new Date(now.getTime() - 3600_000))
          .executeTakeFirstOrThrow();
        if (Number(count.count) >= 10)
          throw new CommandRejected('chat-report-rate-limit');
        result.reportId = randomUUID();
        await tx
          .insertInto('chat_reports')
          .values({
            id: result.reportId,
            group_id: command.groupId,
            message_id: message.id,
            reporter_id: principal.accountId,
            author_id: message.account_id,
            body: message.body,
            reason: command.reason,
            created_at: now,
            expires_at: new Date(now.getTime() + 180 * 86400_000),
            state: 'open',
            resolved_by: null,
            resolution: null,
            resolved_at: null,
          })
          .execute();
        break;
      }
      case 'mute':
        await tx
          .insertInto('chat_preferences')
          .values({
            group_id: command.groupId,
            account_id: principal.accountId,
            muted: command.muted,
          })
          .onConflict((oc) =>
            oc
              .columns(['group_id', 'account_id'])
              .doUpdateSet({ muted: command.muted }),
          )
          .execute();
        break;
      case 'block': {
        if (command.accountId === principal.accountId)
          throw new CommandRejected('chat-cannot-block-self');
        if (command.blocked) {
          const author = await tx
            .selectFrom('chat_messages')
            .select('id')
            .where('group_id', '=', command.groupId)
            .where('account_id', '=', command.accountId)
            .where('created_at', '>', new Date(now.getTime() - 90 * 86400_000))
            .executeTakeFirst();
          if (!author) throw new CommandRejected('chat-member-unavailable');
          await tx
            .insertInto('chat_blocks')
            .values({
              account_id: principal.accountId,
              blocked_id: command.accountId,
            })
            .onConflict((oc) =>
              oc.columns(['account_id', 'blocked_id']).doNothing(),
            )
            .execute();
        } else
          await tx
            .deleteFrom('chat_blocks')
            .where('account_id', '=', principal.accountId)
            .where('blocked_id', '=', command.accountId)
            .execute();
        break;
      }
    }
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
    return result;
  });
}
