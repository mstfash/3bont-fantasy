/** Immutable migration SQL: never import evolving application schemas here. */
export const coreMigration = {
  id: '0001-core',
  sql: `
CREATE TABLE fantasy.accounts (
  id text PRIMARY KEY, display_name text NOT NULL,
  suspended_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fantasy.seasons (id uuid PRIMARY KEY, data jsonb NOT NULL,
  CHECK ((data->>'id' = id::text) IS TRUE));
CREATE TABLE fantasy.clubs (
  id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES fantasy.seasons(id), data jsonb NOT NULL,
  UNIQUE(id, season_id), CHECK ((data->>'id'=id::text AND data->>'seasonId'=season_id::text) IS TRUE)
);
CREATE TABLE fantasy.footballers (
  id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES fantasy.seasons(id), club_id uuid NOT NULL,
  data jsonb NOT NULL, UNIQUE(id,season_id),
  FOREIGN KEY(club_id,season_id) REFERENCES fantasy.clubs(id,season_id),
  CHECK ((data->>'id'=id::text AND data->>'seasonId'=season_id::text AND data->>'clubId'=club_id::text) IS TRUE)
);
CREATE TABLE fantasy.fixtures (
  id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES fantasy.seasons(id), kickoff timestamptz NOT NULL,
  data jsonb NOT NULL, UNIQUE(id,season_id),
  CHECK ((data->>'id'=id::text AND data->>'seasonId'=season_id::text AND (data->>'kickoff')::timestamptz=kickoff) IS TRUE)
);
CREATE INDEX fixture_kickoff ON fantasy.fixtures(kickoff);
CREATE TABLE fantasy.competitions (
  id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES fantasy.seasons(id), slug text NOT NULL UNIQUE,
  revision integer NOT NULL CHECK(revision>0), data jsonb NOT NULL,
  CHECK ((data->>'id'=id::text AND data->>'seasonId'=season_id::text AND data->>'slug'=slug AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE TABLE fantasy.staff_grants (
  id uuid PRIMARY KEY, account_id text NOT NULL REFERENCES fantasy.accounts(id),
  role text NOT NULL CHECK(role IN ('owner','competition-manager','data-steward','moderator','prize-manager','prize-approver','sponsor-manager','support-viewer')),
  competition_id uuid REFERENCES fantasy.competitions(id), granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE NULLS NOT DISTINCT(account_id,role,competition_id)
);
CREATE TABLE fantasy.competition_players (
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id), footballer_id uuid NOT NULL REFERENCES fantasy.footballers(id),
  data jsonb NOT NULL, PRIMARY KEY(competition_id,footballer_id),
  CHECK((data->>'competitionId'=competition_id::text AND data->>'footballerId'=footballer_id::text) IS TRUE)
);
CREATE TABLE fantasy.gameweeks (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  number integer NOT NULL CHECK(number>0), deadline timestamptz NOT NULL, data jsonb NOT NULL,
  UNIQUE(competition_id,number), UNIQUE(id,competition_id),
  CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND (data->>'number')::integer=number AND (data->>'deadline')::timestamptz=deadline) IS TRUE)
);
CREATE INDEX gameweek_deadline ON fantasy.gameweeks(deadline);
CREATE TABLE fantasy.fixture_assignments (
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id), fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id),
  gameweek_id uuid NOT NULL, PRIMARY KEY(competition_id,fixture_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id)
);
CREATE TABLE fantasy.entries (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  account_id text NOT NULL REFERENCES fantasy.accounts(id), revision integer NOT NULL CHECK(revision>0), data jsonb NOT NULL,
  UNIQUE(id,competition_id),
  CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND data->>'accountId'=account_id AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE INDEX entry_owner_competition ON fantasy.entries(account_id,competition_id);
CREATE TABLE fantasy.entry_snapshots (
  entry_id uuid NOT NULL, competition_id uuid NOT NULL, gameweek_id uuid NOT NULL,
  locked_at timestamptz NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(entry_id,gameweek_id),
  FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id)
);
CREATE TABLE fantasy.entry_results (
  entry_id uuid NOT NULL, competition_id uuid NOT NULL, gameweek_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0), points integer NOT NULL, payload jsonb NOT NULL, published_at timestamptz NOT NULL,
  PRIMARY KEY(entry_id,gameweek_id,revision),
  FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id)
);
CREATE TABLE fantasy.provider_evidence (
  id uuid PRIMARY KEY, provider text NOT NULL, resource text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), checksum text NOT NULL, payload jsonb NOT NULL
);
CREATE TABLE fantasy.fact_revisions (
  id uuid PRIMARY KEY, fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id), footballer_id uuid NOT NULL REFERENCES fantasy.footballers(id),
  revision integer NOT NULL CHECK(revision>0), evidence_id uuid REFERENCES fantasy.provider_evidence(id),
  is_override boolean NOT NULL DEFAULT false, actor_id text, reason text, created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL, UNIQUE(fixture_id,footballer_id,revision),
  CHECK(NOT is_override OR (actor_id IS NOT NULL AND reason IS NOT NULL AND length(trim(reason))>0))
);
CREATE TABLE fantasy.result_reviews (
  id uuid PRIMARY KEY, gameweek_id uuid NOT NULL REFERENCES fantasy.gameweeks(id), reason text NOT NULL,
  status text NOT NULL CHECK(status IN ('open','resolved','dismissed')), evidence_id uuid REFERENCES fantasy.provider_evidence(id),
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolved_by text
);
CREATE TABLE fantasy.commands (
  actor_id text NOT NULL, command_id uuid NOT NULL, fingerprint text NOT NULL, accepted_at timestamptz NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(actor_id,command_id)
);
CREATE TABLE fantasy.audit_events (
  id uuid PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, scope_id text, reason text,
  created_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
CREATE INDEX audit_scope_time ON fantasy.audit_events(scope_id,created_at DESC);
`,
} as const;
