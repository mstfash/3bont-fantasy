export const staffSecurityMigration = {
  id: '0002-staff-security',
  sql: `
CREATE TABLE fantasy.staff_session_proofs (
  session_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES fantasy.accounts(id),
  mfa_verified_at timestamptz NOT NULL,
  password_verified_at timestamptz NOT NULL
);
CREATE INDEX staff_proof_account ON fantasy.staff_session_proofs(account_id);
CREATE TABLE fantasy.staff_verification_limits (
  account_id text PRIMARY KEY REFERENCES fantasy.accounts(id),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 5)
);
`,
} as const;
