export const providerAcceptanceMigration = {
  id: '0025-provider-acceptance',
  sql: `
CREATE TABLE fantasy.provider_acceptance_policies (
  binding_id uuid PRIMARY KEY REFERENCES fantasy.provider_season_bindings(id),
  account_id uuid NOT NULL REFERENCES fantasy.provider_accounts(id),
  revision integer NOT NULL CHECK(revision>0),
  data jsonb NOT NULL,
  CHECK((data->>'bindingId'=binding_id::text AND data->>'accountId'=account_id::text AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE TABLE fantasy.provider_acceptances (
  batch_id uuid NOT NULL REFERENCES fantasy.provider_collection_batches(id),
  policy_revision integer NOT NULL CHECK(policy_revision>0),
  fixture_id uuid NOT NULL REFERENCES fantasy.fixtures(id),
  report_evidence_id uuid REFERENCES fantasy.provider_evidence(id),
  state text NOT NULL CHECK(state IN ('accepted','held')),
  source_at timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  PRIMARY KEY(batch_id,policy_revision),
  CHECK((data->>'batchId'=batch_id::text AND data->>'fixtureId'=fixture_id::text AND (data->'policy'->>'revision')::integer=policy_revision AND data->>'state'=state) IS TRUE),
  CHECK((data->>'reportEvidenceId') IS NOT DISTINCT FROM report_evidence_id::text),
  CHECK((state='accepted')=(report_evidence_id IS NOT NULL))
);
CREATE INDEX provider_acceptance_watermark ON fantasy.provider_acceptances(fixture_id,source_at DESC) WHERE state='accepted';
CREATE INDEX provider_acceptance_candidates ON fantasy.provider_collection_batches(planned_at DESC) WHERE state='complete';
`,
} as const;
