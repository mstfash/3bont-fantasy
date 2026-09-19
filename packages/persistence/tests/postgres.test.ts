import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { PgBoss } from 'pg-boss';
import {
  createDatabase,
  migrateApplication,
  applicationSchemaReady,
  pgBossTransactionDb,
  withTransaction,
} from '../src/index.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).pathname !== '/fantasy_proof' ||
  new URL(connectionString).hostname !== '127.0.0.1'
) {
  throw new Error(
    'Use pnpm test:integration to create the isolated disposable database',
  );
}
const pool = new Pool({ connectionString, max: 8 });
const boss = new PgBoss({
  connectionString,
  schema: 'proof_jobs',
  schedule: false,
  supervise: false,
});
const queueErrors: Error[] = [];
boss.on('error', (error) => {
  queueErrors.push(error);
});

void test('production core migration is atomic, concurrently idempotent and queryable through Kysely', async () => {
  await Promise.all([migrateApplication(pool), migrateApplication(pool)]);
  const db = createDatabase(pool);
  const id = randomUUID();
  await db
    .insertInto('seasons')
    .values({
      id,
      data: {
        id,
        name: { ar: 'موسم اختبار', en: 'Test season' },
        startsAt: '2026-08-01T00:00:00Z',
        endsAt: '2027-07-01T00:00:00Z',
        synthetic: true,
      },
    })
    .execute();
  const season = await db
    .selectFrom('seasons')
    .select('data')
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  assert.equal(season.data.name.en, 'Test season');
  const migrations = await pool.query<{ count: string }>(
    'SELECT count(*) FROM fantasy.schema_migrations',
  );
  assert.equal(migrations.rows[0]?.count, '25');
  assert.equal(await applicationSchemaReady(pool), true);
  await assert.rejects(
    pool.query('INSERT INTO fantasy.seasons(id,data) VALUES($1,$2)', [
      randomUUID(),
      {},
    ]),
    /check constraint/,
  );
  await assert.rejects(
    pool.query(
      'INSERT INTO fantasy.clubs(id,season_id,data) VALUES($1,$2,$3)',
      [randomUUID(), id, { id: randomUUID(), seasonId: id }],
    ),
    /check constraint/,
  );
});

void test('production migration refuses a changed applied checksum', async () => {
  await migrateApplication(pool);
  const previous = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM fantasy.schema_migrations WHERE id='0001-core'",
  );
  const checksum = previous.rows[0]?.checksum;
  assert.ok(checksum);
  await pool.query(
    "UPDATE fantasy.schema_migrations SET checksum='changed' WHERE id='0001-core'",
  );
  try {
    assert.equal(await applicationSchemaReady(pool), false);
    await assert.rejects(migrateApplication(pool), /Applied migration changed/);
  } finally {
    await pool.query(
      "UPDATE fantasy.schema_migrations SET checksum=$1 WHERE id='0001-core'",
      [checksum],
    );
  }
});

before(async () => {
  await pool.query(`
    CREATE SCHEMA proof;
    CREATE TABLE proof.entries (
      id integer PRIMARY KEY, bank integer NOT NULL CHECK (bank >= 0), deadline timestamptz NOT NULL
    );
    CREATE TABLE proof.commands (
      command_key text PRIMARY KEY, cost integer NOT NULL, resulting_bank integer NOT NULL,
      accepted_at timestamptz NOT NULL
    );
    CREATE TABLE proof.budget (
      id integer PRIMARY KEY, used integer NOT NULL DEFAULT 0, ceiling integer NOT NULL,
      CHECK (used >= 0 AND used <= ceiling)
    );
  `);
  await boss.start();
  await boss.createQueue('recalculate');
});
beforeEach(async () => {
  await pool.query('TRUNCATE proof.commands, proof.entries, proof.budget');
  await boss.deleteAllJobs('recalculate');
  await pool.query(
    "INSERT INTO proof.entries VALUES (1, 100, clock_timestamp() + interval '1 hour')",
  );
});
after(async () => {
  try {
    await boss.stop();
  } finally {
    await pool.end();
  }
  assert.deepEqual(queueErrors, []);
});

type Debit =
  | { readonly status: 'accepted'; readonly bank: number }
  | { readonly status: 'closed-or-insufficient' };

/** Probe use case, not a production transfer API: ledger + guard + enqueue on one transaction. */
async function debit(
  client: PoolClient,
  key: string,
  cost: number,
): Promise<Debit> {
  await client.query('SELECT id FROM proof.entries WHERE id = 1 FOR UPDATE');
  const existing = await client.query<{ cost: number; resulting_bank: number }>(
    'SELECT cost, resulting_bank FROM proof.commands WHERE command_key = $1',
    [key],
  );
  const previous = existing.rows[0];
  if (previous) {
    if (previous.cost !== cost)
      throw new Error('Idempotency key reused with different content');
    return { status: 'accepted', bank: previous.resulting_bank };
  }
  const updated = await client.query<{ bank: number; accepted_at: Date }>(
    `
    WITH acceptance AS MATERIALIZED (SELECT clock_timestamp() AS instant)
    UPDATE proof.entries SET bank = bank - $1
    WHERE id = 1 AND bank >= $1 AND deadline > (SELECT instant FROM acceptance)
    RETURNING bank, (SELECT instant FROM acceptance) AS accepted_at
  `,
    [cost],
  );
  const row = updated.rows[0];
  if (!row) return { status: 'closed-or-insufficient' };
  await client.query('INSERT INTO proof.commands VALUES ($1,$2,$3,$4)', [
    key,
    cost,
    row.bank,
    row.accepted_at,
  ]);
  await boss.send('recalculate', { key }, { db: pgBossTransactionDb(client) });
  return { status: 'accepted', bank: row.bank };
}

void test('entry state, command ledger and pg-boss enqueue all roll back on failure', async () => {
  await assert.rejects(
    withTransaction(pool, async (client) => {
      assert.deepEqual(await debit(client, 'rollback', 20), {
        status: 'accepted',
        bank: 80,
      });
      throw new Error('Injected failure after enqueue');
    }),
    /Injected failure/u,
  );
  const result = await pool.query<{ bank: number }>(
    'SELECT bank FROM proof.entries WHERE id=1',
  );
  assert.equal(result.rows[0]?.bank, 100);
  const commands = await pool.query('SELECT command_key FROM proof.commands');
  assert.equal(commands.rowCount, 0);
  assert.equal((await boss.fetch<unknown>('recalculate')).length, 0);
});

void test('committed state and job become visible together; job survives a queue instance restart', async () => {
  assert.deepEqual(
    await withTransaction(pool, (client) => debit(client, 'commit', 20)),
    { status: 'accepted', bank: 80 },
  );
  const restarted = new PgBoss({
    connectionString,
    schema: 'proof_jobs',
    schedule: false,
    supervise: false,
  });
  restarted.on('error', (error) => {
    queueErrors.push(error);
  });
  try {
    await restarted.start();
    const jobs = await restarted.fetch<{ key: string }>('recalculate');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.data.key, 'commit');
  } finally {
    await restarted.stop();
  }
});

void test('concurrent retries debit once and queue once; changed content is rejected', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      withTransaction(pool, (client) => debit(client, 'same-command', 30)),
    ),
  );
  assert.ok(
    results.every(
      (result) => result.status === 'accepted' && result.bank === 70,
    ),
  );
  assert.equal((await boss.fetch<unknown>('recalculate')).length, 1);
  await assert.rejects(
    withTransaction(pool, (client) => debit(client, 'same-command', 31)),
    /different content/u,
  );
  const state = await pool.query<{ bank: number }>(
    'SELECT bank FROM proof.entries WHERE id=1',
  );
  assert.equal(state.rows[0]?.bank, 70);
});

void test('distinct competing commands cannot overspend the bank', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      withTransaction(pool, (client) =>
        debit(client, `command-${String(index)}`, 30),
      ),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === 'accepted').length,
    3,
  );
  const state = await pool.query<{ bank: number }>(
    'SELECT bank FROM proof.entries WHERE id=1',
  );
  assert.equal(state.rows[0]?.bank, 10);
});

void test('a request begun before cutoff but blocked on a lock cannot use transaction-start time to enter late', async () => {
  await pool.query(
    "UPDATE proof.entries SET deadline = clock_timestamp() + interval '2 seconds'",
  );
  const blocker = await pool.connect();
  const started = Promise.withResolvers<undefined>();
  let request: Promise<Debit> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM proof.entries WHERE id=1 FOR UPDATE');
    request = withTransaction(pool, async (client) => {
      const early = await client.query<{ early: boolean }>(
        'SELECT now() < deadline AS early FROM proof.entries WHERE id=1',
      );
      assert.equal(early.rows[0]?.early, true);
      started.resolve(undefined);
      return debit(client, 'late', 10);
    });
    // Attach rejection immediately so failures cannot leave the start barrier hanging.
    void request.catch((error: unknown) => {
      started.reject(error);
    });
    await started.promise;
    await blocker.query(
      'SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (deadline-clock_timestamp()))) + 0.05) FROM proof.entries WHERE id=1',
    );
    await blocker.query('COMMIT');
    assert.deepEqual(await request, { status: 'closed-or-insufficient' });
    assert.equal((await boss.fetch<unknown>('recalculate')).length, 0);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (request) await Promise.allSettled([request]);
  }
});

void test('pre-cutoff acceptance may commit later; retry after cutoff returns its original outcome', async () => {
  await withTransaction(pool, async (client) => {
    assert.deepEqual(await debit(client, 'accepted', 10), {
      status: 'accepted',
      bank: 90,
    });
    // Force the deadline into the past after the guarded acceptance, before commit.
    await client.query(
      "UPDATE proof.entries SET deadline = clock_timestamp() - interval '1 second'",
    );
  });
  assert.deepEqual(
    await withTransaction(pool, (client) => debit(client, 'accepted', 10)),
    { status: 'accepted', bank: 90 },
  );
  assert.deepEqual(
    await withTransaction(pool, (client) => debit(client, 'new-late', 10)),
    { status: 'closed-or-insufficient' },
  );
});

void test('durable conditional reservations admit no more than the configured ceiling under contention', async () => {
  await pool.query('INSERT INTO proof.budget VALUES (1, 0, 7)');
  const attempts = await Promise.all(
    Array.from({ length: 40 }, () =>
      pool.query(
        'UPDATE proof.budget SET used=used+1 WHERE id=1 AND used < ceiling RETURNING used',
      ),
    ),
  );
  assert.equal(attempts.filter((r) => r.rowCount === 1).length, 7);
  const afterReconnect = new Pool({ connectionString, max: 1 });
  try {
    const state = await afterReconnect.query<{ used: number }>(
      'SELECT used FROM proof.budget WHERE id=1',
    );
    assert.equal(state.rows[0]?.used, 7);
    assert.equal(
      (
        await afterReconnect.query(
          'UPDATE proof.budget SET used=used+1 WHERE id=1 AND used < ceiling RETURNING used',
        )
      ).rowCount,
      0,
    );
  } finally {
    await afterReconnect.end();
  }
});
