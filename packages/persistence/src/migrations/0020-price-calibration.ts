export const priceCalibrationMigration = {
  id: '0020-price-calibration',
  sql: `
CREATE TABLE fantasy.price_calibration_runs (
  id uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 16777216),
  CHECK ((jsonb_typeof(payload)='object' AND payload->>'id'=id::text AND payload->'basis'->>'competitionId'=competition_id::text) IS TRUE)
);
CREATE INDEX price_calibration_competition_time ON fantasy.price_calibration_runs(competition_id,created_at DESC);
CREATE TABLE fantasy.price_calibration_sources (
  report_id uuid NOT NULL REFERENCES fantasy.price_calibration_runs(id),
  gameweek_id uuid NOT NULL,
  revision integer NOT NULL,
  PRIMARY KEY(report_id,gameweek_id),
  FOREIGN KEY(gameweek_id,revision) REFERENCES fantasy.round_calculations(gameweek_id,revision)
);
`,
} as const;
