import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { defaultChatSettings, chatCommandSchema } from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { executeChatCommand } from '../src/chat-commands.ts';
import { executeChatModeration } from '../src/chat-moderation.ts';
import {
  readChatPage,
  readChatModeration,
  purgeExpiredChat,
} from '../src/chat-query.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 8 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});
void test('group chat enforces account identity, membership, cross-room rate limits and private expiring moderation evidence', async () => {
  await seedDemoReplay(db);
  const competition = await db
    .selectFrom('competitions')
    .select('id')
    .where('slug', '=', 'cairo-replay')
    .executeTakeFirstOrThrow();
  const entries = await db
    .selectFrom('entries')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  const a = entries[0]?.data,
    b = entries.find((e) => e.data.accountId !== a?.accountId)?.data;
  assert.ok(a && b);
  const principal = (accountId: string) => ({
    accountId,
    sessionId: 'chat-test',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  });
  const owner = principal(a.accountId),
    member = principal(b.accountId);
  const create = () =>
    executeGroupCommand(db, owner, {
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      entryId: a.id,
      name: 'Chat proof',
      description: 'A disposable conversation group',
      visibility: 'public',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      invitationToken: 'b'.repeat(64),
    });
  const group = await create(),
    common = { competitionId: competition.id, groupId: group.groupId };
  await assert.rejects(
    readChatPage(db, member, competition.id, group.groupId),
    AccessDenied,
  );
  await executeGroupCommand(db, member, {
    ...common,
    kind: 'join',
    commandId: randomUUID(),
    entryId: b.id,
    invitationToken: null,
  });
  assert.equal(
    (await readChatPage(db, owner, competition.id, group.groupId)).settings
      .enabled,
    false,
  );
  await assert.rejects(
    executeChatCommand(db, member, {
      ...common,
      commandId: randomUUID(),
      kind: 'post',
      body: 'Before enable',
    }),
    (e: unknown) => e instanceof CommandRejected && e.code === 'chat-disabled',
  );
  await executeChatModeration(db, owner, [], {
    ...common,
    kind: 'configure',
    commandId: randomUUID(),
    settings: { ...defaultChatSettings, enabled: true },
    reason: 'Enable this group conversation',
  });
  const post = {
    ...common,
    kind: 'post' as const,
    commandId: randomUUID(),
    body: '<script>alert(1)</script> كرة القدم',
  };
  const [one, retry] = await Promise.all([
    executeChatCommand(db, member, post),
    executeChatCommand(db, member, post),
  ]);
  assert.deepEqual(one, retry);
  assert.ok(one.messageId);
  const burst = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      executeChatCommand(db, member, {
        ...post,
        commandId: randomUUID(),
        body: `Message ${String(i)}`,
      }),
    ),
  );
  assert.equal(burst.filter((r) => r.status === 'fulfilled').length, 4);
  assert.equal(burst.filter((r) => r.status === 'rejected').length, 1);
  const second = await create();
  await executeGroupCommand(db, member, {
    competitionId: competition.id,
    groupId: second.groupId,
    kind: 'join',
    commandId: randomUUID(),
    entryId: b.id,
    invitationToken: null,
  });
  await executeChatModeration(db, owner, [], {
    competitionId: competition.id,
    groupId: second.groupId,
    kind: 'configure',
    commandId: randomUUID(),
    settings: { ...defaultChatSettings, enabled: true },
    reason: 'Enable second conversation',
  });
  await assert.rejects(
    executeChatCommand(db, member, {
      ...post,
      groupId: second.groupId,
      commandId: randomUUID(),
    }),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'chat-rate-limit',
  );
  await executeChatCommand(db, owner, {
    ...common,
    kind: 'block',
    commandId: randomUUID(),
    accountId: member.accountId,
    blocked: true,
  });
  assert.equal(
    (await readChatPage(db, owner, competition.id, group.groupId)).messages
      .length,
    0,
  );
  await executeChatCommand(db, owner, {
    ...common,
    kind: 'block',
    commandId: randomUUID(),
    accountId: member.accountId,
    blocked: false,
  });
  const report = await executeChatCommand(db, owner, {
    ...common,
    kind: 'report',
    commandId: randomUUID(),
    messageId: one.messageId,
    reason: 'Review this suspicious content',
  });
  assert.ok(report.reportId);
  await executeChatCommand(db, member, {
    ...common,
    kind: 'delete',
    commandId: randomUUID(),
    messageId: one.messageId,
  });
  assert.equal(
    (
      await readChatPage(db, owner, competition.id, group.groupId)
    ).messages.find((m) => m.id === one.messageId)?.body,
    '',
  );
  assert.equal(
    (await readChatModeration(db, owner, [], competition.id, group.groupId))
      .reports[0]?.body,
    post.body,
  );
  await assert.rejects(
    readChatModeration(db, member, [], competition.id, group.groupId),
    AccessDenied,
  );
  await executeChatModeration(db, owner, [], {
    ...common,
    kind: 'resolve-report',
    commandId: randomUUID(),
    reportId: report.reportId,
    decision: 'actioned',
    reason: 'Author removed reported content',
  });
  await executeChatModeration(db, owner, [], {
    ...common,
    kind: 'timeout',
    commandId: randomUUID(),
    accountId: member.accountId,
    until: new Date(Date.now() + 3600_000).toISOString(),
    reason: 'Pause repeated disruptive messages',
  });
  await assert.rejects(
    executeChatCommand(db, member, { ...post, commandId: randomUUID() }),
    (e: unknown) => e instanceof CommandRejected && e.code === 'chat-timeout',
  );
  await executeChatCommand(db, member, {
    ...common,
    kind: 'mute',
    commandId: randomUUID(),
    muted: true,
  });
  assert.equal(
    (await readChatPage(db, member, competition.id, group.groupId)).muted,
    true,
  );
  await executeGroupCommand(db, owner, {
    ...common,
    kind: 'review-member',
    commandId: randomUUID(),
    entryId: b.id,
    expectedStatus: 'active',
    decision: 'remove',
    reason: 'Remove membership in access proof',
  });
  await assert.rejects(
    readChatPage(db, member, competition.id, group.groupId),
    AccessDenied,
  );
  await assert.rejects(executeChatCommand(db, member, post), AccessDenied);
  await assert.rejects(
    readChatModeration(
      db,
      member,
      [{ role: 'moderator', competitionId: randomUUID() }],
      competition.id,
      group.groupId,
    ),
    AccessDenied,
  );
  assert.equal(
    (
      await readChatModeration(
        db,
        member,
        [{ role: 'moderator', competitionId: competition.id }],
        competition.id,
        group.groupId,
      )
    ).reports.length,
    1,
  );
  await db
    .insertInto('chat_messages')
    .values(
      Array.from({ length: 55 }, (_, i) => ({
        id: randomUUID(),
        group_id: group.groupId,
        account_id: owner.accountId,
        body: `Pagination ${String(i)}`,
        removed_at: null,
      })),
    )
    .execute();
  const latest = await readChatPage(db, owner, competition.id, group.groupId);
  assert.equal(latest.messages.length, 50);
  assert.equal(latest.hasOlder, true);
  const cursor = latest.messages[0]?.sequence;
  assert.ok(cursor);
  const older = await readChatPage(
    db,
    owner,
    competition.id,
    group.groupId,
    cursor,
  );
  assert.equal(older.messages.length, 10);
  assert.equal(older.hasOlder, false);
  assert.equal(
    older.messages.some((m) => latest.messages.some((n) => n.id === m.id)),
    false,
  );
  const old = new Date(Date.now() - 91 * 86400_000);
  await db
    .updateTable('chat_messages')
    .set({ created_at: old })
    .where('group_id', '=', group.groupId)
    .execute();
  assert.equal(
    (await readChatPage(db, owner, competition.id, group.groupId)).messages
      .length,
    0,
  );
  await purgeExpiredChat(db);
  assert.equal(
    (await readChatModeration(db, owner, [], competition.id, group.groupId))
      .reports.length,
    1,
  );
  await db
    .updateTable('chat_reports')
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where('id', '=', report.reportId)
    .execute();
  await purgeExpiredChat(db);
  assert.equal(
    (await readChatModeration(db, owner, [], competition.id, group.groupId))
      .reports.length,
    0,
  );
  assert.equal(
    chatCommandSchema.safeParse({ ...post, body: 'spoof\u202etext' }).success,
    false,
  );
  const receipts = await db
    .selectFrom('commands')
    .select('result')
    .where('actor_id', '=', member.accountId)
    .execute();
  assert.equal(JSON.stringify(receipts).includes(post.body), false);
  const groupIds = [group.groupId, second.groupId];
  for (const table of [
    'chat_moderation_events',
    'chat_reports',
    'chat_timeouts',
    'chat_preferences',
    'chat_messages',
    'chat_settings',
    'group_membership_history',
    'group_memberships',
  ] as const)
    await db.deleteFrom(table).where('group_id', 'in', groupIds).execute();
  await db.deleteFrom('league_groups').where('id', 'in', groupIds).execute();
});
