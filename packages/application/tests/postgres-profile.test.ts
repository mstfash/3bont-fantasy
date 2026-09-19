import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { executeProfileCommand } from '../src/profile.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 4 }),
  db = createDatabase(pool),
  auth = createIdentity(pool, {
    baseURL: 'http://127.0.0.1:3100',
    secret: randomUUID() + randomUUID(),
    secureCookies: false,
    sendMail: async () => {},
  });
before(async () => {
  await migrateApplication(pool);
  await migrateIdentity(auth);
});
after(async () => {
  await db.destroy();
});
void test('profile updates synchronize identity and game names atomically, reject stale edits and leave no old names in receipts', async () => {
  const id = `profile-${randomUUID()}`,
    original = 'Profile original';
  await db
    .insertInto('accounts')
    .values({ id, display_name: original, suspended_until: null })
    .execute();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
    [id, original, `${id}@profile-proof.test`],
  );
  const principal = {
      accountId: id,
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: null,
      authenticatedAt: new Date(),
    },
    command = {
      commandId: randomUUID(),
      expectedDisplayName: original,
      displayName: 'مدير الفانتازي',
    };
  const replies = await Promise.all([
    executeProfileCommand(db, principal, command),
    executeProfileCommand(db, principal, command),
  ]);
  assert.deepEqual(replies[0], replies[1]);
  assert.equal(
    (
      await pool.query<{ name: string }>(
        'SELECT name FROM "user" WHERE id=$1',
        [id],
      )
    ).rows[0]?.name,
    command.displayName,
  );
  assert.equal(
    (
      await db
        .selectFrom('accounts')
        .select('display_name')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).display_name,
    command.displayName,
  );
  await assert.rejects(
    executeProfileCommand(db, principal, {
      ...command,
      commandId: randomUUID(),
      displayName: 'Stale edit',
    }),
    (e) => e instanceof CommandRejected && e.code === 'profile-changed',
  );
  await assert.rejects(
    executeProfileCommand(db, principal, {
      ...command,
      displayName: 'Changed retry',
    }),
    (e) => e instanceof CommandRejected && e.code === 'idempotency-conflict',
  );
  const receipts = await db
    .selectFrom('commands')
    .select('result')
    .where('actor_id', '=', id)
    .execute();
  assert.equal(receipts.length, 1);
  assert.ok(!JSON.stringify(receipts).includes(original));
  const audits = await db
    .selectFrom('audit_events')
    .select(['payload', 'reason'])
    .where('actor_id', '=', id)
    .execute();
  assert.equal(audits.length, 1);
  assert.ok(!JSON.stringify(audits).includes(original));
  await db
    .updateTable('accounts')
    .set({ suspended_until: new Date(Date.now() + 86400000) })
    .where('id', '=', id)
    .execute();
  await assert.rejects(
    executeProfileCommand(db, principal, command),
    AccessDenied,
  );
  await assert.rejects(
    executeProfileCommand(db, { ...principal, emailVerified: false }, command),
    AccessDenied,
  );
  const missing = randomUUID();
  await db
    .insertInto('accounts')
    .values({ id: missing, display_name: original, suspended_until: null })
    .execute();
  await assert.rejects(
    executeProfileCommand(db, { ...principal, accountId: missing }, command),
    AccessDenied,
  );
  assert.equal(
    (
      await db
        .selectFrom('accounts')
        .select('display_name')
        .where('id', '=', missing)
        .executeTakeFirstOrThrow()
    ).display_name,
    original,
  );
  const native = await auth.handler(
    new Request('http://127.0.0.1:3100/api/auth/update-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3100',
      },
      body: JSON.stringify({ name: 'Bypass attempt' }),
    }),
  );
  assert.equal(native.status, 404);
});
