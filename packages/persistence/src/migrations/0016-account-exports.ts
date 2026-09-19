export const accountExportsMigration = {
  id: '0016-account-exports',
  sql: `
CREATE TABLE fantasy.account_exports(
 id uuid PRIMARY KEY,account_id text NOT NULL REFERENCES fantasy.accounts(id),state text NOT NULL CHECK(state IN ('queued','ready','failed')),
 requested_at timestamptz NOT NULL,expires_at timestamptz,data jsonb NOT NULL,
 CHECK((data->>'id'=id::text AND data->>'accountId'=account_id AND data->>'state'=state AND requested_at=(data->>'requestedAt')::timestamptz AND expires_at IS NOT DISTINCT FROM (data->>'expiresAt')::timestamptz) IS TRUE)
);
CREATE INDEX account_exports_owner ON fantasy.account_exports(account_id,requested_at DESC);
CREATE INDEX account_exports_queued ON fantasy.account_exports(requested_at) WHERE state='queued';
CREATE TABLE fantasy.account_export_chunks(
 export_id uuid NOT NULL REFERENCES fantasy.account_exports(id) ON DELETE CASCADE,sequence integer NOT NULL CHECK(sequence>=0),body text NOT NULL,
 PRIMARY KEY(export_id,sequence)
);
ALTER TABLE fantasy.worker_runs DROP CONSTRAINT worker_runs_task_check;
ALTER TABLE fantasy.worker_runs ADD CONSTRAINT worker_runs_task_check CHECK(task IN ('game-cycle','maintenance','account-exports'));
`,
} as const;
