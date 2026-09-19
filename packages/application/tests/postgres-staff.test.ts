import { createIdentity, migrateIdentity } from '../src/identity.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  executeStaffCommand,
  readStaffDirectory,
} from '../src/staff-management.ts';
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
void test('staff management uses current authority, protects the last owner and revokes session proofs atomically', async () => {
  const accountId = `staff-${randomUUID()}`,
    targetId = `staff-${randomUUID()}`;
  await db
    .insertInto('accounts')
    .values([
      {
        id: accountId,
        display_name: 'Staff proof owner',
        suspended_until: null,
      },
      {
        id: targetId,
        display_name: 'Staff proof target',
        suspended_until: null,
      },
    ])
    .execute();
  for (const id of [accountId, targetId])
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled","createdAt","updatedAt") VALUES($1,$2,$3,true,true,now(),now())',
      [id, 'Staff fixture', `${id}@staff-proof.test`],
    );
  const ownerGrantId = randomUUID();
  await db
    .insertInto('staff_grants')
    .values({
      id: ownerGrantId,
      account_id: accountId,
      role: 'owner',
      competition_id: null,
      granted_by: accountId,
    })
    .execute();
  // This fixture represents an already authenticated session. Host and Docker
  // database clocks can differ slightly; keep it in the past for both clocks.
  const databaseClock = await pool.query<{ now: Date }>(
    'SELECT clock_timestamp() AS now',
  );
  const databaseNow = databaseClock.rows[0]?.now;
  assert.ok(databaseNow);
  const now = new Date(Math.min(Date.now(), databaseNow.getTime()) - 1000),
    principal = {
      accountId,
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: now,
      authenticatedAt: now,
    },
    grants = [{ role: 'owner' as const, competitionId: null }];
  const reason = 'Reviewed staffing requirement';
  await assert.rejects(
    executeStaffCommand(db, principal, grants, {
      kind: 'revoke',
      commandId: randomUUID(),
      grantId: ownerGrantId,
      reason,
    }),
    (e) => e instanceof CommandRejected && e.code === 'last-owner-protected',
  );
  await assert.rejects(
    executeStaffCommand(db, { ...principal, accountId: targetId }, grants, {
      kind: 'grant',
      commandId: randomUUID(),
      accountId: targetId,
      role: 'owner',
      competitionId: null,
      reason,
    }),
    AccessDenied,
  );
  await assert.rejects(
    executeStaffCommand(
      db,
      { ...principal, authenticatedAt: new Date(Date.now() - 16 * 60000) },
      grants,
      {
        kind: 'grant',
        commandId: randomUUID(),
        accountId: targetId,
        role: 'owner',
        competitionId: null,
        reason,
      },
    ),
    AccessDenied,
  );
  const sessionId = randomUUID();
  await db
    .insertInto('staff_session_proofs')
    .values({
      session_id: sessionId,
      account_id: targetId,
      password_verified_at: now,
      mfa_verified_at: now,
    })
    .execute();
  const command = {
    kind: 'grant' as const,
    commandId: randomUUID(),
    accountId: targetId,
    role: 'owner' as const,
    competitionId: null,
    reason,
  };
  await pool.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    targetId,
  ]);
  await assert.rejects(
    executeStaffCommand(db, principal, grants, command),
    (e) =>
      e instanceof CommandRejected && e.code === 'staff-owner-mfa-required',
  );
  await pool.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
    targetId,
  ]);
  const result = await executeStaffCommand(db, principal, grants, command);
  assert.deepEqual(
    await executeStaffCommand(db, principal, grants, command),
    result,
  );
  assert.equal(
    await db
      .selectFrom('staff_session_proofs')
      .select('session_id')
      .where('session_id', '=', sessionId)
      .executeTakeFirst(),
    undefined,
  );
  const directory = await readStaffDirectory(
    db,
    principal,
    grants,
    'Staff proof',
  );
  assert.equal(directory.candidates.length, 2);
  const attempts = await Promise.allSettled([
    executeStaffCommand(db, principal, grants, {
      kind: 'revoke',
      commandId: randomUUID(),
      grantId: result.grant.id,
      reason,
    }),
    executeStaffCommand(db, { ...principal, accountId: targetId }, grants, {
      kind: 'revoke',
      commandId: randomUUID(),
      grantId: ownerGrantId,
      reason,
    }),
  ]);
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  const remaining = await db
    .selectFrom('staff_grants')
    .selectAll()
    .where('role', '=', 'owner')
    .where('account_id', 'in', [accountId, targetId])
    .execute();
  assert.equal(remaining.length, 1);
  const removed = remaining[0]?.account_id === accountId ? targetId : accountId;
  await assert.rejects(
    executeStaffCommand(db, { ...principal, accountId: removed }, grants, {
      kind: 'grant',
      commandId: randomUUID(),
      accountId: removed,
      role: 'owner',
      competitionId: null,
      reason,
    }),
    AccessDenied,
  );
  // This fixture must not grant authority to later unrelated tests.
  await db
    .deleteFrom('staff_grants')
    .where('account_id', 'in', [accountId, targetId])
    .execute();
});
