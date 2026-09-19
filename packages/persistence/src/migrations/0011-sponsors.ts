export const sponsorsMigration = {
  id: '0011-sponsors',
  sql: `
CREATE TABLE fantasy.sponsor_assets(id uuid PRIMARY KEY,competition_id uuid REFERENCES fantasy.competitions(id),label text NOT NULL,content bytea NOT NULL CHECK(octet_length(content)<=1048576),width integer NOT NULL CHECK(width>0),height integer NOT NULL CHECK(height>0),checksum text NOT NULL,authorization_reference text NOT NULL,uploaded_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX sponsor_assets_scope ON fantasy.sponsor_assets(competition_id);
CREATE TABLE fantasy.sponsor_campaigns(id uuid PRIMARY KEY,competition_id uuid REFERENCES fantasy.competitions(id),revision integer NOT NULL,data jsonb NOT NULL,CHECK((data->>'id'=id::text AND (data->>'revision')::integer=revision) IS TRUE),CHECK((data->>'competitionId') IS NOT DISTINCT FROM competition_id::text));
CREATE INDEX sponsor_campaign_scope ON fantasy.sponsor_campaigns(competition_id);
CREATE TABLE fantasy.sponsor_daily_metrics(campaign_id uuid NOT NULL REFERENCES fantasy.sponsor_campaigns(id),revision integer NOT NULL,day text NOT NULL,locale text NOT NULL CHECK(locale IN('ar','en')),kind text NOT NULL CHECK(kind IN('impression','click')),count integer NOT NULL CHECK(count>0),PRIMARY KEY(campaign_id,revision,day,locale,kind));
CREATE TABLE fantasy.sponsor_metric_receipts(fingerprint text NOT NULL,kind text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(fingerprint,kind));
CREATE INDEX sponsor_metric_expiry ON fantasy.sponsor_metric_receipts(expires_at);
`,
} as const;
