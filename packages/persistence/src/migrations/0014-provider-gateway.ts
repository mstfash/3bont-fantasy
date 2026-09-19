export const providerGatewayMigration = {
  id: '0014-provider-gateway',
  sql: `
CREATE TABLE fantasy.provider_accounts(
 id uuid PRIMARY KEY,provider text NOT NULL UNIQUE CHECK(provider='api-football-direct'),revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 minute_headroom integer,minute_headroom_until timestamptz,observed_minute_limit integer,inflight_attempt_id uuid,cooldown_until timestamptz,inflight_until timestamptz,next_dispatch_at timestamptz,consecutive_failures integer NOT NULL DEFAULT 0,last_success_at timestamptz,last_error_code text,
 CHECK((data->>'id'=id::text AND data->>'provider'=provider AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE TABLE fantasy.provider_quota_windows(
 account_id uuid NOT NULL REFERENCES fantasy.provider_accounts(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 ceiling integer NOT NULL CHECK(ceiling>0),ordinary_ceiling integer NOT NULL CHECK(ordinary_ceiling>=0),used integer NOT NULL DEFAULT 0 CHECK(used>=0),ordinary_used integer NOT NULL DEFAULT 0 CHECK(ordinary_used>=0),
 PRIMARY KEY(account_id,starts_at),CHECK(ends_at>starts_at),CHECK(ordinary_ceiling<=ceiling)
);
CREATE TABLE fantasy.provider_attempts(
 id uuid PRIMARY KEY,account_id uuid NOT NULL,window_start timestamptz NOT NULL,request jsonb NOT NULL,request_fingerprint text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('ordinary','correction')),reserved_at timestamptz NOT NULL,dispatch_expires_at timestamptz NOT NULL,finished_at timestamptz,
 outcome text CHECK(outcome IN ('success','provider-error','rate-limited','unconfirmed','schema-invalid','dispatch-expired')),http_status integer,response_checksum text,evidence_id uuid REFERENCES fantasy.provider_evidence(id),
 FOREIGN KEY(account_id,window_start) REFERENCES fantasy.provider_quota_windows(account_id,starts_at)
);
CREATE INDEX provider_attempt_minute ON fantasy.provider_attempts(account_id,reserved_at DESC);
CREATE INDEX provider_request_recent ON fantasy.provider_attempts(account_id,request_fingerprint,reserved_at DESC);
`,
} as const;
