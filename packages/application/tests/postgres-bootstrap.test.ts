import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { bootstrapOwner } from '../src/bootstrap-owner.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 1 }),
  db = createDatabase(pool),
  id = `bootstrap-${randomUUID()}`;
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
  try {
    await db.deleteFrom('staff_grants').where('account_id', '=', id).execute();
    await db.deleteFrom('audit_events').where('actor_id', '=', id).execute();
    await db.deleteFrom('accounts').where('id', '=', id).execute();
    await pool.query('DROP SCHEMA IF EXISTS bootstrap_identity_test CASCADE');
  } finally {
    await db.destroy();
  }
});
void test('owner bootstrap uses the connection identity schema and refuses closed accounts', async () => {
  await pool.query('CREATE SCHEMA bootstrap_identity_test');
  await pool.query(
    'CREATE TABLE bootstrap_identity_test."user" (LIKE public."user" INCLUDING ALL)',
  );
  await pool.query('SET search_path TO bootstrap_identity_test,public');
  const email = `${id}@example.test`;
  await db
    .insertInto('accounts')
    .values({ id, display_name: 'Bootstrap fixture', suspended_until: null })
    .execute();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled","createdAt","updatedAt") VALUES($1,$2,$3,true,true,now(),now())',
    [id, 'Bootstrap fixture', email],
  );
  // This fixture requires an empty owner roster and uses a separate identity schema.
  const existing = await db
    .selectFrom('staff_grants')
    .selectAll()
    .where('role', '=', 'owner')
    .execute();
  assert.equal(
    existing.length,
    0,
    'Bootstrap test needs an empty owner roster',
  );
  assert.equal(await bootstrapOwner(db, email), 'created');
  assert.equal(await bootstrapOwner(db, email), 'exists');
  await db.deleteFrom('staff_grants').where('account_id', '=', id).execute();
  await db
    .updateTable('accounts')
    .set({ closed_at: new Date() })
    .where('id', '=', id)
    .execute();
  await assert.rejects(bootstrapOwner(db, email), /account is unavailable/u);
  assert.equal(
    (
      await db
        .selectFrom('staff_grants')
        .select('id')
        .where('account_id', '=', id)
        .execute()
    ).length,
    0,
  );
});
