export const providerNormalizationMigration = {
  id: '0021-provider-normalization',
  sql: `
CREATE TABLE fantasy.provider_normalization_sources (
  report_evidence_id uuid NOT NULL REFERENCES fantasy.provider_evidence(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES fantasy.provider_attempts(id),
  PRIMARY KEY(report_evidence_id,attempt_id)
);
CREATE INDEX provider_normalization_attempt ON fantasy.provider_normalization_sources(attempt_id);
CREATE TABLE fantasy.provider_normalization_mappings (
  report_evidence_id uuid NOT NULL REFERENCES fantasy.provider_evidence(id) ON DELETE CASCADE,
  mapping_id uuid NOT NULL,
  revision integer NOT NULL,
  PRIMARY KEY(report_evidence_id,mapping_id),
  FOREIGN KEY(mapping_id,revision) REFERENCES fantasy.provider_identity_history(mapping_id,revision)
);
CREATE INDEX provider_normalization_mapping ON fantasy.provider_normalization_mappings(mapping_id,revision);
`,
} as const;
