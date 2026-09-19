export const priceBatchesMigration = {
  id: '0004-price-batches',
  sql: `
CREATE TABLE fantasy.price_batches (
  id uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  editing_gameweek_id uuid NOT NULL,
  actor_id text NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competition_id, editing_gameweek_id),
  FOREIGN KEY(editing_gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id)
);
CREATE TABLE fantasy.price_batch_sources (
  competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
  gameweek_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES fantasy.price_batches(id),
  PRIMARY KEY(competition_id,gameweek_id),
  FOREIGN KEY(gameweek_id,competition_id) REFERENCES fantasy.gameweeks(id,competition_id)
);
`,
} as const;
