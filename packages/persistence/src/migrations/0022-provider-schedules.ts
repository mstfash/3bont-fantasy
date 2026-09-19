export const providerSchedulesMigration = {
  id: '0022-provider-schedules',
  sql: `
CREATE TABLE fantasy.provider_schedules (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES fantasy.provider_accounts(id),binding_id uuid NOT NULL UNIQUE REFERENCES fantasy.provider_season_bindings(id),revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 CHECK((data->>'id'=id::text AND data->>'accountId'=account_id::text AND data->>'bindingId'=binding_id::text AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE TABLE fantasy.provider_collection_batches (
 id uuid PRIMARY KEY,schedule_id uuid NOT NULL REFERENCES fantasy.provider_schedules(id),fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id),mapping_id uuid NOT NULL,mapping_revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','collecting','complete','held','cancelled')),
 planned_at timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL, claim_id uuid, claimed_until timestamptz, data jsonb NOT NULL,
 FOREIGN KEY(mapping_id,mapping_revision) REFERENCES fantasy.provider_identity_history(mapping_id,revision),
 CHECK((data->>'id'=id::text AND data->>'scheduleId'=schedule_id::text AND data->>'fixtureId'=fixture_id::text AND data->>'state'=state AND data->>'mappingId'=mapping_id::text AND (data->>'mappingRevision')::integer=mapping_revision) IS TRUE),
 CHECK((claim_id IS NULL)=(claimed_until IS NULL))
);
CREATE UNIQUE INDEX provider_collection_active ON fantasy.provider_collection_batches(schedule_id,fixture_id) WHERE state IN ('queued','collecting');
CREATE INDEX provider_collection_due ON fantasy.provider_collection_batches(next_attempt_at,planned_at) WHERE state IN ('queued','collecting');
CREATE INDEX provider_collection_history ON fantasy.provider_collection_batches(schedule_id,fixture_id,planned_at DESC);
CREATE TABLE fantasy.provider_collection_attempts (
 batch_id uuid NOT NULL REFERENCES fantasy.provider_collection_batches(id),step integer NOT NULL CHECK(step BETWEEN 0 AND 3),
 attempt_id uuid NOT NULL UNIQUE REFERENCES fantasy.provider_attempts(id),PRIMARY KEY(batch_id,attempt_id)
);
ALTER TABLE fantasy.worker_runs DROP CONSTRAINT worker_runs_task_check;
ALTER TABLE fantasy.worker_runs ADD CONSTRAINT worker_runs_task_check CHECK(task IN ('game-cycle','maintenance','account-exports','provider-collection'));
`,
} as const;
