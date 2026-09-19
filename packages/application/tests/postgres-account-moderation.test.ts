import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { executeAccountModeration } from '../src/account-moderation.ts';
import { readSupportEntries } from '../src/support-query.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
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
after(async () => {
  await db.destroy();
});
void test('platform account suspensions revoke sessions, reject scoped/stale authority and preserve privileged recovery', async () => {
  const actor = randomUUID(),
    target = randomUUID(),
    role = randomUUID();
  await db
    .insertInto('accounts')
    .values([
      { id: actor, display_name: 'Moderation operator', suspended_until: null },
      {
        id: target,
        display_name: 'Moderation participant',
        suspended_until: null,
      },
    ])
    .execute();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
    [target, 'Moderation participant', `${target}@moderation-proof.test`],
  );
  await pool.query(
    'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',
    [randomUUID(), randomUUID(), target],
  );
  await db
    .insertInto('staff_grants')
    .values({
      id: role,
      account_id: actor,
      role: 'moderator',
      competition_id: null,
      granted_by: actor,
    })
    .execute();
  const principal = {
      accountId: actor,
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'moderator' as const, competitionId: null }],
    command = {
      commandId: randomUUID(),
      accountId: target,
      expectedSuspendedUntil: null,
      until: new Date(Date.now() + 86400_000).toISOString(),
      reason: 'Reviewed repeated conduct violations',
      evidenceReference: 'Private case reference QA-100',
    };
  await assert.rejects(
    executeAccountModeration(
      db,
      principal,
      [{ role: 'moderator', competitionId: randomUUID() }],
      command,
    ),
    AccessDenied,
  );
  await assert.rejects(
    executeAccountModeration(
      db,
      { ...principal, mfaVerifiedAt: new Date(Date.now() - 16 * 60000) },
      grants,
      command,
    ),
    AccessDenied,
  );
  const [accepted, retry] = await Promise.all([
    executeAccountModeration(db, principal, grants, command),
    executeAccountModeration(db, principal, grants, command),
  ]);
  assert.deepEqual(accepted, retry);
  assert.equal(
    (
      await pool.query<{ count: string }>(
        'SELECT count(*) FROM "session" WHERE "userId"=$1',
        [target],
      )
    ).rows[0]?.count,
    '0',
  );
  await assert.rejects(
    executeAccountModeration(db, principal, grants, {
      ...command,
      commandId: randomUUID(),
      until: null,
    }),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'account-moderation-changed',
  );
  const restored = await executeAccountModeration(db, principal, grants, {
    ...command,
    commandId: randomUUID(),
    expectedSuspendedUntil: accepted.suspendedUntil,
    until: null,
  });
  assert.equal(restored.suspendedUntil, null);
  await db
    .insertInto('staff_grants')
    .values({
      id: randomUUID(),
      account_id: target,
      role: 'support-viewer',
      competition_id: null,
      granted_by: actor,
    })
    .execute();
  await assert.rejects(
    executeAccountModeration(db, principal, grants, {
      ...command,
      commandId: randomUUID(),
    }),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'account-staff-protected',
  );
  await db.deleteFrom('staff_grants').where('id', '=', role).execute();
  await assert.rejects(
    executeAccountModeration(db, principal, grants, {
      ...command,
      commandId: randomUUID(),
      until: null,
    }),
    AccessDenied,
  );
});
void test('support projects scoped status without private lineups or identity secrets', async () => {
  await seedDemoReplay(db);
  const competition = await db
    .selectFrom('competitions')
    .select('id')
    .where('slug', '=', 'cairo-replay')
    .executeTakeFirstOrThrow();
  const principal = {
      accountId: 'support-test',
      sessionId: 'support-session',
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [
      { role: 'support-viewer' as const, competitionId: competition.id },
    ];
  const data = await readSupportEntries(
    db,
    principal,
    grants,
    competition.id,
    '',
  );
  assert.equal(data.entries.length, 6);
  assert.ok(data.entries.every((e) => e.lockedSnapshots === 3));
  const serialized = JSON.stringify(data);
  for (const key of [
    'players',
    'captainId',
    'bank',
    'token',
    'email',
    'password',
    'permanentSquad',
  ])
    assert.equal(serialized.includes(`"${key}"`), false);
  await assert.rejects(
    readSupportEntries(db, principal, grants, randomUUID(), ''),
    AccessDenied,
  );
});
void test('identity rejects new sign-in sessions during suspension and permits fresh sign-in after restoration', async () => {
  const auth = createIdentity(pool, {
      baseURL: 'http://127.0.0.1:3100',
      secret: randomUUID() + randomUUID(),
      secureCookies: false,
      sendMail: async () => {},
    }),
    email = `qa-${randomUUID()}@suspension-proof.test`,
    password = randomUUID() + randomUUID();
  const registered = await auth.api.signUpEmail({
    body: { email, password, name: 'Suspension sign-in proof' },
  });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
    registered.user.id,
  ]);
  await db
    .updateTable('accounts')
    .set({ suspended_until: new Date(Date.now() + 86400_000) })
    .where('id', '=', registered.user.id)
    .execute();
  await assert.rejects(
    auth.api.signInEmail({ body: { email, password } }),
    /Account suspended/u,
  );
  await db
    .updateTable('accounts')
    .set({ suspended_until: null })
    .where('id', '=', registered.user.id)
    .execute();
  const signedIn = await auth.api.signInEmail({ body: { email, password } });
  assert.equal(signedIn.user.id, registered.user.id);
});
