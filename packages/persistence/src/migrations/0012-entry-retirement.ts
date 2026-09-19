export const entryRetirementMigration = {
  id: '0012-entry-retirement',
  sql: `
CREATE TABLE fantasy.entry_retirements(entry_id uuid PRIMARY KEY,competition_id uuid NOT NULL,retired_at timestamptz NOT NULL,FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id));
CREATE INDEX entry_retirement_competition ON fantasy.entry_retirements(competition_id);
`,
} as const;
