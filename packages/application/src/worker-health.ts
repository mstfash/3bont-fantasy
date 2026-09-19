import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  idSchema,
  workerTaskSchema,
  workerRunSummarySchema,
  type WorkerTask,
  type WorkerRunSummary,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
/** Records orchestration outcomes, not private data or exception text. Domain commands keep their own transactions/idempotency. */
export async function recordWorkerRun(
  db: ReturnType<typeof createDatabase>,
  instanceId: string,
  task: WorkerTask,
  execute: () => Promise<WorkerRunSummary>,
) {
  idSchema.parse(instanceId);
  workerTaskSchema.parse(task);
  const id = randomUUID();
  await db
    .insertInto('worker_runs')
    .values({
      id,
      instance_id: instanceId,
      task,
      status: 'running',
      finished_at: null,
      summary: null,
    })
    .execute();
  try {
    const summary = workerRunSummarySchema.parse(await execute());
    await db
      .updateTable('worker_runs')
      .set({
        finished_at: sql<Date>`clock_timestamp()`,
        status: summary.issueCount ? 'attention' : 'ok',
        summary,
      })
      .where('id', '=', id)
      .execute();
    return { runId: id, summary };
  } catch (error) {
    try {
      await db
        .updateTable('worker_runs')
        .set({ finished_at: sql<Date>`clock_timestamp()`, status: 'failed' })
        .where('id', '=', id)
        .execute();
    } catch {
      console.error('Unable to persist failed worker outcome', {
        runId: id,
        task,
      });
    }
    console.error('Worker task failed', { runId: id, task });
    throw error;
  }
}
export async function readWorkerHealth(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
) {
  requireCapability(principal, grants, 'operations.read', null, new Date());
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const rows = await tx
        .selectFrom('worker_runs')
        .selectAll()
        .where(
          'started_at',
          '>=',
          sql<Date>`clock_timestamp()-interval '30 days'`,
        )
        .orderBy('started_at', 'desc')
        .limit(50)
        .execute();
      const latest = await Promise.all(
        (
          [
            'game-cycle',
            'maintenance',
            'account-exports',
            'provider-collection',
          ] as const
        ).map(async (task) => ({
          task,
          run:
            (await tx
              .selectFrom('worker_runs')
              .selectAll()
              .where('task', '=', task)
              .where(
                'started_at',
                '>=',
                sql<Date>`clock_timestamp()-interval '30 days'`,
              )
              .orderBy('started_at', 'desc')
              .limit(1)
              .executeTakeFirst()) ?? null,
        })),
      );
      const now = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (!now) throw new Error('Database clock unavailable');
      return {
        now: now.toISOString(),
        latest: latest.map(({ task, run }) => ({
          task,
          run,
          state: !run
            ? ('unobserved' as const)
            : now.getTime() - run.started_at.getTime() >
                (task === 'maintenance' ? 90 : 3) * 60_000
              ? ('stale' as const)
              : run.status,
        })),
        runs: rows,
      };
    });
}
export async function purgeWorkerRuns(db: ReturnType<typeof createDatabase>) {
  await db
    .deleteFrom('worker_runs')
    .where('started_at', '<', sql<Date>`clock_timestamp()-interval '30 days'`)
    .execute();
}
