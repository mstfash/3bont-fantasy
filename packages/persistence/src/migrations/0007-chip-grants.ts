export const chipGrantsMigration = {
  id: '0007-chip-grants',
  sql: `
CREATE TABLE fantasy.chip_grants (
  id uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  gameweek_id uuid NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(id,competition_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id),
  CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND data->>'gameweekId'=gameweek_id::text) IS TRUE)
);
CREATE INDEX chip_grant_round ON fantasy.chip_grants(gameweek_id);
CREATE TABLE fantasy.chip_grant_receipts (
  grant_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  competition_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(grant_id,entry_id),
  FOREIGN KEY(grant_id,competition_id) REFERENCES fantasy.chip_grants(id,competition_id),
  FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id)
);
`,
} as const;
