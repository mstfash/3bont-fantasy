/** Immutable migration: evidence and calculations are retained for reproducible results. */
export const matchResultsMigration = {
  id: '0003-match-results',
  sql: `
CREATE TABLE fantasy.gameweek_player_pools (
  gameweek_id uuid PRIMARY KEY REFERENCES fantasy.gameweeks(id),
  payload jsonb NOT NULL CHECK((jsonb_typeof(payload->'players')='array') IS TRUE)
);
CREATE TABLE fantasy.fixture_observations (
  fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id),
  revision integer NOT NULL CHECK(revision>0),
  evidence_id uuid NOT NULL REFERENCES fantasy.provider_evidence(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(fixture_id,revision),
  CHECK((payload->'fixture'->>'id'=fixture_id::text AND (payload->'fixture'->>'revision')::integer=revision) IS TRUE)
);
CREATE TABLE fantasy.round_calculations (
  gameweek_id uuid NOT NULL REFERENCES fantasy.gameweeks(id),
  revision integer NOT NULL CHECK(revision>0),
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(gameweek_id,revision),
  CHECK((payload->>'gameweekId'=gameweek_id::text AND (payload->>'revision')::integer=revision AND payload->>'fingerprint'=fingerprint) IS TRUE)
);
CREATE UNIQUE INDEX one_open_result_review ON fantasy.result_reviews(gameweek_id,reason) WHERE status='open';
`,
} as const;
