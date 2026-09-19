import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import type { createDatabase } from '@fantasy/persistence';
import {
  chatModerationCommandSchema,
  chatCommandResultSchema,
  type ChatModerationCommand,
} from '@fantasy/contracts';
import type { Principal, StaffGrant } from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { loadChatAccess, currentChatMessage } from './chat-access.ts';
export async function executeChatModeration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ChatModerationCommand,
) {
  const command = chatModerationCommandSchema.parse(input),
    fingerprint = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
  return db.transaction().execute(async (tx) => {
    const current = await loadCurrentStaffWriteContext(tx, principal);
    const currentGrants = grants.filter((g) =>
      current.grants.some(
        (c) => c.role === g.role && c.competitionId === g.competitionId,
      ),
    );
    const { now, settings } = await loadChatAccess(
      tx,
      principal,
      command.competitionId,
      command.groupId,
      true,
      currentGrants,
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
      case 'configure': {
        if (settings.revision !== command.settings.revision)
          throw new CommandRejected('chat-settings-changed');
        const updated = {
          ...command.settings,
          revision: settings.revision + 1,
        };
        await tx
          .insertInto('chat_settings')
          .values({ group_id: command.groupId, data: updated })
          .onConflict((oc) =>
            oc.column('group_id').doUpdateSet({ data: updated }),
          )
          .execute();
        break;
      }
      case 'remove': {
        const message = await currentChatMessage(
          tx,
          command.groupId,
          command.messageId,
          now,
        );
        result.messageId = message.id;
        if (!message.removed_at) {
          const existing = await tx
            .selectFrom('chat_reports')
            .select('id')
            .where('message_id', '=', message.id)
            .where('reporter_id', '=', principal.accountId)
            .executeTakeFirst();
          result.reportId = existing?.id ?? randomUUID();
          if (!existing)
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
                state: 'actioned',
                resolved_by: principal.accountId,
                resolution: command.reason,
                resolved_at: now,
              })
              .execute();
          await tx
            .updateTable('chat_reports')
            .set({
              state: 'actioned',
              resolved_by: principal.accountId,
              resolution: command.reason,
              resolved_at: now,
            })
            .where('message_id', '=', message.id)
            .where('group_id', '=', command.groupId)
            .where('state', '=', 'open')
            .execute();
          await tx
            .updateTable('chat_messages')
            .set({ body: '', removed_at: now })
            .where('id', '=', message.id)
            .execute();
        }
        break;
      }
      case 'timeout': {
        const member = await tx
          .selectFrom('group_memberships')
          .select('account_id')
          .where('group_id', '=', command.groupId)
          .where('account_id', '=', command.accountId)
          .executeTakeFirst();
        if (!member) throw new CommandRejected('chat-member-unavailable');
        if (command.until) {
          const until = new Date(command.until);
          if (until <= now || until.getTime() > now.getTime() + 30 * 86400_000)
            throw new CommandRejected('chat-timeout-window');
          await tx
            .insertInto('chat_timeouts')
            .values({
              group_id: command.groupId,
              account_id: command.accountId,
              until_at: until,
              reason: command.reason,
              actor_id: principal.accountId,
            })
            .onConflict((oc) =>
              oc.columns(['group_id', 'account_id']).doUpdateSet({
                until_at: until,
                reason: command.reason,
                actor_id: principal.accountId,
              }),
            )
            .execute();
        } else
          await tx
            .deleteFrom('chat_timeouts')
            .where('group_id', '=', command.groupId)
            .where('account_id', '=', command.accountId)
            .execute();
        break;
      }
      case 'resolve-report': {
        const report = await tx
          .selectFrom('chat_reports')
          .select('state')
          .where('id', '=', command.reportId)
          .where('group_id', '=', command.groupId)
          .where('expires_at', '>', now)
          .executeTakeFirst();
        if (!report || report.state !== 'open')
          throw new CommandRejected('chat-report-unavailable');
        await tx
          .updateTable('chat_reports')
          .set({
            state: command.decision,
            resolved_by: principal.accountId,
            resolution: command.reason,
            resolved_at: now,
          })
          .where('id', '=', command.reportId)
          .execute();
        result.reportId = command.reportId;
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
    await tx
      .insertInto('chat_moderation_events')
      .values({
        id: randomUUID(),
        group_id: command.groupId,
        actor_id: principal.accountId,
        action: command.kind,
        reason: command.reason,
        created_at: now,
        expires_at: new Date(now.getTime() + 180 * 86400_000),
      })
      .execute();
    // Evidence/reasons expire separately; permanent audit contains only action references, never message text.
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `chat.${command.kind}`,
        scope_id: command.competitionId,
        reason: 'Recorded room moderation action',
        payload: {
          groupId: command.groupId,
          ...result,
          ...(command.kind === 'timeout'
            ? { accountId: command.accountId, until: command.until }
            : {}),
          ...(command.kind === 'configure'
            ? { settings: command.settings }
            : {}),
        },
      })
      .execute();
    return result;
  });
}
export function executeOrganizerChatModeration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: ChatModerationCommand,
) {
  return executeChatModeration(db, principal, [], input);
}
