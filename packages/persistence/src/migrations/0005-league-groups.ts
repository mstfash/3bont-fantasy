export const leagueGroupsMigration = {
  id: '0005-league-groups',
  sql: `
CREATE TABLE fantasy.league_groups (
  id uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  organizer_id text NOT NULL REFERENCES fantasy.accounts(id),
  invitation_hash text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  data jsonb NOT NULL,
  UNIQUE(id,competition_id),
  CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND data->>'organizerId'=organizer_id AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE INDEX league_group_competition ON fantasy.league_groups(competition_id);
CREATE INDEX league_group_organizer ON fantasy.league_groups(organizer_id);
CREATE TABLE fantasy.group_memberships (
  group_id uuid NOT NULL,
  competition_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  account_id text NOT NULL REFERENCES fantasy.accounts(id),
  status text NOT NULL CHECK(status IN ('pending','active','left','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,entry_id),
  FOREIGN KEY(group_id,competition_id) REFERENCES fantasy.league_groups(id,competition_id),
  FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id)
);
CREATE INDEX group_membership_account ON fantasy.group_memberships(account_id,status);
`,
} as const;
