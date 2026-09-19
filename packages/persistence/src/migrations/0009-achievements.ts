export const achievementsMigration = {
  id: '0009-achievements',
  sql: `
CREATE TABLE fantasy.achievement_definitions (
 id uuid NOT NULL, version integer NOT NULL CHECK(version>0),competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
 revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 PRIMARY KEY(id,version),UNIQUE(id,version,competition_id),
 CHECK((data->>'id'=id::text AND (data->>'version')::integer=version AND data->>'competitionId'=competition_id::text AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE INDEX achievements_competition ON fantasy.achievement_definitions(competition_id);
CREATE TABLE fantasy.achievement_grants (
 id uuid PRIMARY KEY,definition_id uuid NOT NULL,version integer NOT NULL,competition_id uuid NOT NULL,
 account_id text NOT NULL REFERENCES fantasy.accounts(id),entry_id uuid,scope_key text NOT NULL,data jsonb NOT NULL,
 UNIQUE(definition_id,version,scope_key),
 FOREIGN KEY(definition_id,version,competition_id) REFERENCES fantasy.achievement_definitions(id,version,competition_id),
 FOREIGN KEY(entry_id,competition_id) REFERENCES fantasy.entries(id,competition_id),
 CHECK((data->>'id'=id::text AND data->>'definitionId'=definition_id::text AND (data->>'version')::integer=version AND data->>'competitionId'=competition_id::text AND data->>'accountId'=account_id AND data->>'scopeKey'=scope_key) IS TRUE),
 CHECK((data->>'entryId') IS NOT DISTINCT FROM entry_id::text)
);
CREATE INDEX achievement_owner ON fantasy.achievement_grants(account_id,competition_id);
`,
} as const;
