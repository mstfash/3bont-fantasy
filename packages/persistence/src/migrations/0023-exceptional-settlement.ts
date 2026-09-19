export const exceptionalSettlementMigration = {
  id: '0023-exceptional-settlement',
  sql: `
CREATE TABLE fantasy.fixture_dispositions (
  id uuid PRIMARY KEY,
  fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id),
  revision integer NOT NULL CHECK(revision > 0),
  data jsonb NOT NULL,
  UNIQUE(fixture_id, revision)
);
CREATE TABLE fantasy.empty_round_settlements (
  gameweek_id uuid PRIMARY KEY REFERENCES fantasy.gameweeks(id),
  actor_id text NOT NULL,
  fingerprint text NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) >= 5),
  settled_at timestamptz NOT NULL DEFAULT now()
);
`,
} as const;
