export const providerIdentitiesMigration = {
  id: '0019-provider-identities',
  sql: `
CREATE TABLE fantasy.provider_season_bindings(
 id uuid PRIMARY KEY,provider text NOT NULL CHECK(provider='api-football-direct'),season_id uuid NOT NULL REFERENCES fantasy.seasons(id),
 league_id bigint NOT NULL CHECK(league_id>0),season_year integer NOT NULL CHECK(season_year BETWEEN 2000 AND 2200),evidence_id uuid NOT NULL REFERENCES fantasy.provider_evidence(id),data jsonb NOT NULL,
 UNIQUE(provider,season_id),UNIQUE(provider,league_id,season_year),
 CHECK((data->>'id'=id::text AND data->>'provider'=provider AND data->>'seasonId'=season_id::text AND (data->>'leagueId')::bigint=league_id AND (data->>'seasonYear')::integer=season_year AND data->>'evidenceId'=evidence_id::text) IS TRUE)
);
CREATE TABLE fantasy.provider_identities(
 id uuid PRIMARY KEY,binding_id uuid NOT NULL REFERENCES fantasy.provider_season_bindings(id),kind text NOT NULL CHECK(kind IN ('club','footballer','fixture')),
 external_id bigint NOT NULL CHECK(external_id>0),entity_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 UNIQUE(binding_id,kind,external_id),
 CHECK((data->>'id'=id::text AND data->>'bindingId'=binding_id::text AND data->>'kind'=kind AND (data->>'externalId')::bigint=external_id AND data->>'entityId'=entity_id::text AND (data->>'revision')::integer=revision AND data->>'state' IN ('active','retired')) IS TRUE)
);
CREATE UNIQUE INDEX provider_identity_target ON fantasy.provider_identities(binding_id,kind,entity_id) WHERE data->>'state'='active';
CREATE TABLE fantasy.provider_identity_history(
 mapping_id uuid NOT NULL REFERENCES fantasy.provider_identities(id),revision integer NOT NULL CHECK(revision>0),evidence_id uuid NOT NULL REFERENCES fantasy.provider_evidence(id),data jsonb NOT NULL,
 PRIMARY KEY(mapping_id,revision),CHECK((data->>'id'=mapping_id::text AND (data->>'revision')::integer=revision AND data->>'evidenceId'=evidence_id::text) IS TRUE)
);
`,
} as const;
