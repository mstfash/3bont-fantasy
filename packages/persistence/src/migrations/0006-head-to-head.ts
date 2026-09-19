export const headToHeadMigration = {
  id: '0006-head-to-head',
  sql: `
CREATE TABLE fantasy.h2h_editions (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL,
  competition_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  data jsonb NOT NULL,
  UNIQUE(id,competition_id),
  FOREIGN KEY(group_id,competition_id) REFERENCES fantasy.league_groups(id,competition_id),
  CHECK((data->>'id'=id::text AND data->>'groupId'=group_id::text AND data->>'competitionId'=competition_id::text AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE INDEX h2h_group ON fantasy.h2h_editions(group_id);
CREATE TABLE fantasy.h2h_registrations (
  edition_id uuid NOT NULL,
  competition_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(edition_id,entry_id),
  FOREIGN KEY(edition_id,competition_id) REFERENCES fantasy.h2h_editions(id,competition_id),
  FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id)
);
CREATE TABLE fantasy.h2h_forfeits (
  edition_id uuid NOT NULL,
  competition_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  gameweek_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(edition_id,entry_id,gameweek_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id),
  FOREIGN KEY(edition_id,competition_id) REFERENCES fantasy.h2h_editions(id,competition_id),
  FOREIGN KEY(edition_id,entry_id) REFERENCES fantasy.h2h_registrations(edition_id,entry_id)
);
`,
} as const;
