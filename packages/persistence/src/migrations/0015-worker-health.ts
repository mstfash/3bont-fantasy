export const workerHealthMigration = {
  id: '0015-worker-health',
  sql: `
CREATE TABLE fantasy.worker_runs(
 id uuid PRIMARY KEY,instance_id uuid NOT NULL,task text NOT NULL CHECK(task IN ('game-cycle','maintenance')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','ok','attention','failed')),summary jsonb,
 CHECK((status='running' AND finished_at IS NULL) OR (status<>'running' AND finished_at IS NOT NULL)),
 CHECK(finished_at IS NULL OR finished_at>=started_at)
);
CREATE INDEX worker_runs_recent ON fantasy.worker_runs(started_at DESC);
CREATE INDEX worker_runs_task_recent ON fantasy.worker_runs(task,started_at DESC);
`,
} as const;
