export const snapshotRepairsMigration = {
  id: '0024-snapshot-repairs',
  sql: `
CREATE TABLE fantasy.entry_snapshot_repairs (
  entry_id uuid NOT NULL,
  gameweek_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision >= 2),
  result_revision integer NOT NULL CHECK(result_revision > 0),
  data jsonb NOT NULL,
  PRIMARY KEY(entry_id,gameweek_id,revision),
  FOREIGN KEY(entry_id,gameweek_id) REFERENCES fantasy.entry_snapshots(entry_id,gameweek_id),
  FOREIGN KEY(gameweek_id,result_revision) REFERENCES fantasy.round_calculations(gameweek_id,revision) DEFERRABLE INITIALLY DEFERRED,
  CHECK((data->>'entryId'=entry_id::text AND data->>'gameweekId'=gameweek_id::text AND (data->>'revision')::integer=revision AND (data->>'resultRevision')::integer=result_revision) IS TRUE)
);
CREATE INDEX snapshot_repairs_round ON fantasy.entry_snapshot_repairs(gameweek_id,entry_id,revision DESC);
`,
} as const;
