import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { z } from 'zod';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { entrySchema, groupCommandSchema } from '@fantasy/contracts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import {
  requestAccountExport,
  readAccountExportDownload,
  readAccountExportChunk,
  purgeAccountExports,
} from '../src/account-exports.ts';
import { buildNextAccountExport } from '../src/account-export-builder.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
  await migrateIdentity(
    createIdentity(pool, {
      baseURL: 'http://127.0.0.1:3100',
      secret: randomUUID() + randomUUID(),
      secureCookies: false,
      sendMail: async () => {},
    }),
  );
});
const fixtureAccounts: string[] = [];
const fixtureEntries: string[] = [];
const fixtureGroups: string[] = [];
after(async () => {
  try {
    await db
      .deleteFrom('account_exports')
      .where('account_id', 'in', fixtureAccounts)
      .execute();
    for (const table of [
      'chat_reports',
      'chat_messages',
      'group_membership_history',
      'group_memberships',
    ] as const)
      await db
        .deleteFrom(table)
        .where('group_id', 'in', fixtureGroups)
        .execute();
    await db
      .deleteFrom('league_groups')
      .where('id', 'in', fixtureGroups)
      .execute();
    await db
      .deleteFrom('entry_results')
      .where('entry_id', 'in', fixtureEntries)
      .execute();
    await db
      .deleteFrom('entry_snapshots')
      .where('entry_id', 'in', fixtureEntries)
      .execute();
    await db.deleteFrom('entries').where('id', 'in', fixtureEntries).execute();
    await db
      .deleteFrom('audit_events')
      .where('actor_id', 'in', fixtureAccounts)
      .execute();
    await db
      .deleteFrom('commands')
      .where('actor_id', 'in', fixtureAccounts)
      .execute();
    await pool.query('DELETE FROM "session" WHERE "userId"=ANY($1::text[])', [
      fixtureAccounts,
    ]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
      fixtureAccounts,
    ]);
    await db
      .deleteFrom('accounts')
      .where('id', 'in', fixtureAccounts)
      .execute();
  } finally {
    await db.destroy();
  }
});
void test('private archives page owner data, redact private evidence, commit once, reject oversize builds and expire', async () => {
  const competitionId = await seedDemoReplay(db),
    template = (
      await db
        .selectFrom('entries')
        .select('data')
        .where('competition_id', '=', competitionId)
        .orderBy('id')
        .executeTakeFirstOrThrow()
    ).data;
  const owner = `export-${randomUUID()}`,
    other = `other-${randomUUID()}`,
    invitation = randomBytes(32).toString('hex');
  fixtureAccounts.push(owner, other);
  for (const id of [owner, other]) {
    await db
      .insertInto('accounts')
      .values({
        id,
        display_name: id === owner ? 'Archive owner' : 'Foreign participant',
        suspended_until: null,
      })
      .execute();
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
      [id, id, `${id}@archive-proof.test`],
    );
  }
  const principal = (id: string) => ({
    accountId: id,
    sessionId: 'archive-session',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  });
  const entry = entrySchema.parse({
    ...template,
    id: randomUUID(),
    accountId: owner,
    name: 'Owner private squad',
  });
  fixtureEntries.push(entry.id);
  await db
    .insertInto('entries')
    .values({
      id: entry.id,
      competition_id: competitionId,
      account_id: owner,
      revision: entry.revision,
      data: entry,
    })
    .execute();
  const foreign = entrySchema.parse({
    ...template,
    id: randomUUID(),
    accountId: other,
    name: 'FOREIGN_PRIVATE_SQUAD',
  });
  fixtureEntries.push(foreign.id);
  await db
    .insertInto('entries')
    .values({
      id: foreign.id,
      competition_id: competitionId,
      account_id: other,
      revision: foreign.revision,
      data: foreign,
    })
    .execute();
  const snapshots = await db
    .selectFrom('entry_snapshots')
    .selectAll()
    .where('entry_id', '=', template.id)
    .execute();
  assert.ok(snapshots.length > 0);
  for (const s of snapshots)
    await db
      .insertInto('entry_snapshots')
      .values({ ...s, entry_id: entry.id })
      .execute();
  const result = await db
    .selectFrom('entry_results')
    .selectAll()
    .where('entry_id', '=', template.id)
    .executeTakeFirstOrThrow();
  await db
    .insertInto('entry_results')
    .values({ ...result, entry_id: entry.id })
    .execute();
  const group = await executeGroupCommand(
    db,
    principal(owner),
    groupCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId,
      name: 'Private export group',
      description: 'Archive ownership proof',
      visibility: 'private',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      entryId: entry.id,
      invitationToken: invitation,
    }),
  );
  fixtureGroups.push(group.groupId);
  for (let i = 0; i < 105; i++)
    await db
      .insertInto('chat_messages')
      .values({
        id: randomUUID(),
        group_id: group.groupId,
        account_id: owner,
        body: `Owner message ${String(i)} ${'أ'.repeat(800)}`,
        created_at: new Date(Date.now() - i * 1000),
        removed_at: null,
      })
      .execute();
  await db
    .insertInto('chat_messages')
    .values([
      {
        id: randomUUID(),
        group_id: group.groupId,
        account_id: other,
        body: 'FOREIGN_PRIVATE_CHAT',
        removed_at: null,
      },
      {
        id: randomUUID(),
        group_id: group.groupId,
        account_id: owner,
        body: '',
        removed_at: new Date(),
      },
      {
        id: randomUUID(),
        group_id: group.groupId,
        account_id: owner,
        body: 'EXPIRED_CHAT_SECRET',
        created_at: new Date(Date.now() - 91 * 86400000),
        removed_at: null,
      },
    ])
    .execute();
  await pool.query(
    'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',
    [randomUUID(), 'EXCLUDED_SESSION_TOKEN', owner],
  );
  const command = {
    commandId: randomUUID(),
    scope: { competitionId: null, historyFrom: null, historyUntil: null },
  };
  const [first, retry] = await Promise.all([
    requestAccountExport(db, principal(owner), command),
    requestAccountExport(db, principal(owner), command),
  ]);
  assert.equal(first.archive.id, retry.archive.id);
  await assert.rejects(
    requestAccountExport(db, principal(owner), {
      ...command,
      commandId: randomUUID(),
    }),
    (e) => e instanceof CommandRejected && e.code === 'archive-already-queued',
  );
  const builds = await Promise.all([
    buildNextAccountExport(db),
    buildNextAccountExport(db),
  ]);
  assert.equal(builds.filter(Boolean).length, 1);
  assert.equal(builds.find(Boolean)?.state, 'ready');
  const ready = await readAccountExportDownload(
    db,
    principal(owner),
    first.archive.id,
  );
  const chunks = await db
    .selectFrom('account_export_chunks')
    .select('body')
    .where('export_id', '=', ready.id)
    .orderBy('sequence')
    .execute();
  assert.ok(chunks.length > 1);
  const text = chunks.map((c) => c.body).join('');
  assert.equal(Buffer.byteLength(text), ready.byteLength);
  assert.equal(createHash('sha256').update(text).digest('hex'), ready.checksum);
  const records = text
    .trimEnd()
    .split('\n')
    .map((line) =>
      z.object({ type: z.string(), data: z.unknown() }).parse(JSON.parse(line)),
    );
  assert.equal(
    records.filter((r) => r.type === 'own-chat-message').length,
    106,
  );
  assert.equal(
    records.filter((r) => r.type === 'locked-squad').length,
    snapshots.length,
  );
  assert.equal(records.filter((r) => r.type === 'entry-result').length, 1);
  assert.equal(records.filter((r) => r.type === 'entry').length, 1);
  for (const secret of [
    'FOREIGN_PRIVATE_SQUAD',
    'FOREIGN_PRIVATE_CHAT',
    'REMOVED_CHAT_SECRET',
    'EXPIRED_CHAT_SECRET',
    'EXCLUDED_SESSION_TOKEN',
    invitation,
  ])
    assert.ok(!text.includes(secret));
  await assert.rejects(
    readAccountExportDownload(db, principal(other), ready.id),
    (e) => e instanceof CommandRejected && e.code === 'archive-unavailable',
  );
  assert.equal(
    await readAccountExportChunk(db, principal(other), ready.id, 0),
    undefined,
  );
  const narrow = await requestAccountExport(db, principal(owner), {
    commandId: randomUUID(),
    scope: {
      competitionId,
      historyFrom: new Date(Date.now() - 120 * 86400000).toISOString(),
      historyUntil: new Date(Date.now() - 100 * 86400000).toISOString(),
    },
  });
  assert.equal((await buildNextAccountExport(db))?.state, 'ready');
  const narrowText = (
    await db
      .selectFrom('account_export_chunks')
      .select('body')
      .where('export_id', '=', narrow.archive.id)
      .orderBy('sequence')
      .execute()
  )
    .map((c) => c.body)
    .join('');
  assert.ok(!narrowText.includes('Owner message'));
  assert.ok(!narrowText.includes('"type":"locked-squad"'));
  assert.ok(narrowText.includes('Owner private squad'));
  const oversized = await requestAccountExport(db, principal(owner), {
    ...command,
    commandId: randomUUID(),
  });
  assert.equal(
    (
      await buildNextAccountExport(db, {
        maximumBytes: 512,
        maximumMilliseconds: 60_000,
      })
    )?.state,
    'failed',
  );
  const failed = await db
    .selectFrom('account_exports')
    .select('data')
    .where('id', '=', oversized.archive.id)
    .executeTakeFirstOrThrow();
  assert.equal(failed.data.errorCode, 'archive-too-large');
  assert.equal(
    (
      await db
        .selectFrom('account_export_chunks')
        .selectAll()
        .where('export_id', '=', oversized.archive.id)
        .execute()
    ).length,
    0,
  );
  await assert.rejects(
    requestAccountExport(db, principal(owner), {
      ...command,
      commandId: randomUUID(),
    }),
    (e) => e instanceof CommandRejected && e.code === 'archive-request-limit',
  );
  await db
    .updateTable('accounts')
    .set({ suspended_until: new Date(Date.now() + 86400000) })
    .where('id', '=', owner)
    .execute();
  await assert.rejects(
    readAccountExportDownload(db, principal(owner), ready.id),
    AccessDenied,
  );
  await db
    .updateTable('accounts')
    .set({ suspended_until: null })
    .where('id', '=', owner)
    .execute();
  const expires = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('account_exports')
    .set({ expires_at: expires, data: { ...ready, expiresAt: expires } })
    .where('id', '=', ready.id)
    .execute();
  await assert.rejects(
    readAccountExportDownload(db, principal(owner), ready.id),
    (e) => e instanceof CommandRejected && e.code === 'archive-unavailable',
  );
  await purgeAccountExports(db);
  assert.equal(
    await db
      .selectFrom('account_export_chunks')
      .selectAll()
      .where('export_id', '=', ready.id)
      .executeTakeFirst(),
    undefined,
  );
});
