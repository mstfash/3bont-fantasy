import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql } from 'kysely';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import type { WorkerRunSummary } from '@fantasy/contracts';
import {
  recordWorkerRun,
  readWorkerHealth,
  purgeWorkerRuns,
} from '../src/worker-health.ts';
import { AccessDenied } from '../src/authorization.ts';
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
});
after(async () => {
  await db.destroy();
});
void test('worker health records running, attention and failure independently, protects global access and expires history', async () => {
  const actor = {
      accountId: randomUUID(),
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'owner' as const, competitionId: null }],
    instance = randomUUID();
  const read = () => readWorkerHealth(db, actor, grants);
  assert.ok((await read()).latest.every((t) => t.state === 'unobserved'));
  await assert.rejects(
    readWorkerHealth(db, actor, [
      { role: 'competition-manager', competitionId: randomUUID() },
    ]),
    AccessDenied,
  );
  const started = Promise.withResolvers<undefined>(),
    finish = Promise.withResolvers<WorkerRunSummary>();
  const running = recordWorkerRun(db, instance, 'game-cycle', async () => {
    started.resolve(undefined);
    return finish.promise;
  });
  await started.promise;
  assert.equal(
    (await read()).latest.find((t) => t.task === 'game-cycle')?.state,
    'running',
  );
  finish.resolve({
    counts: { roundsLocked: 2 },
    issueCount: 1,
    issues: [{ kind: 'gameweek', id: randomUUID(), code: 'scoring-failed' }],
  });
  const outcome = await running;
  assert.equal(
    (await read()).latest.find((t) => t.task === 'game-cycle')?.state,
    'attention',
  );
  const failure = new Error('synthetic-secret-must-not-be-in-health-record');
  await assert.rejects(
    recordWorkerRun(db, instance, 'maintenance', () => Promise.reject(failure)),
    (error) => error === failure,
  );
  const failed = (await read()).latest.find((t) => t.task === 'maintenance');
  assert.equal(failed?.state, 'failed');
  assert.equal(failed.run?.summary, null);
  assert.ok(!JSON.stringify(await read()).includes(failure.message));
  await db
    .updateTable('worker_runs')
    .set({ started_at: sql<Date>`clock_timestamp()-interval '4 minutes'` })
    .where('id', '=', outcome.runId)
    .execute();
  assert.equal(
    (await read()).latest.find((t) => t.task === 'game-cycle')?.state,
    'stale',
  );
  const [first, second] = await Promise.all([
    recordWorkerRun(db, randomUUID(), 'game-cycle', () =>
      Promise.resolve({
        counts: { roundsLocked: 3 },
        issueCount: 0,
        issues: [],
      }),
    ),
    recordWorkerRun(db, randomUUID(), 'maintenance', () =>
      Promise.resolve({
        counts: {},
        issueCount: 0,
        issues: [],
      }),
    ),
  ]);
  assert.notEqual(first.runId, second.runId);
  assert.ok(
    (await read()).latest
      .filter(
        (t) => !['account-exports', 'provider-collection'].includes(t.task),
      )
      .every((t) => t.state === 'ok'),
  );
  const oldest = randomUUID();
  await db
    .insertInto('worker_runs')
    .values({
      id: oldest,
      instance_id: instance,
      task: 'maintenance',
      started_at: sql<Date>`clock_timestamp()-interval '31 days'`,
      finished_at: sql<Date>`clock_timestamp()-interval '31 days'`,
      status: 'ok',
      summary: { counts: {}, issueCount: 0, issues: [] },
    })
    .execute();
  await purgeWorkerRuns(db);
  assert.equal(
    await db
      .selectFrom('worker_runs')
      .select('id')
      .where('id', '=', oldest)
      .executeTakeFirst(),
    undefined,
  );
  assert.ok(
    await db
      .selectFrom('worker_runs')
      .select('id')
      .where('id', '=', first.runId)
      .executeTakeFirst(),
  );
});
