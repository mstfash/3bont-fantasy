export const prizesMigration = {
  id: '0008-prizes',
  sql: `
CREATE TABLE fantasy.group_membership_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','active','left','removed')),
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY(group_id,entry_id) REFERENCES fantasy.group_memberships(group_id,entry_id)
);
CREATE INDEX membership_at_cutoff ON fantasy.group_membership_history(group_id,entry_id,occurred_at DESC,sequence DESC);
INSERT INTO fantasy.group_membership_history(group_id,entry_id,status,occurred_at)
SELECT group_id,entry_id,status,changed_at FROM fantasy.group_memberships;
CREATE TABLE fantasy.prize_pools (
 id uuid PRIMARY KEY,competition_id uuid NOT NULL REFERENCES fantasy.competitions(id),
 group_id uuid,revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 UNIQUE(id,competition_id),
 FOREIGN KEY(group_id,competition_id) REFERENCES fantasy.league_groups(id,competition_id),
 CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND (data->>'revision')::integer=revision) IS TRUE),
 CHECK((data->>'groupId') IS NOT DISTINCT FROM group_id::text)
);
CREATE INDEX prize_pool_competition ON fantasy.prize_pools(competition_id,group_id);
CREATE TABLE fantasy.prize_eligibility (
 pool_id uuid NOT NULL REFERENCES fantasy.prize_pools(id),account_id text NOT NULL REFERENCES fantasy.accounts(id),
 excluded boolean NOT NULL,reason text NOT NULL,evidence_reference text NOT NULL,reviewed_by text NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(pool_id,account_id)
);
CREATE TABLE fantasy.prize_proposals (
 id uuid PRIMARY KEY,pool_id uuid NOT NULL,competition_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 FOREIGN KEY(pool_id,competition_id) REFERENCES fantasy.prize_pools(id,competition_id),
 CHECK((data->>'id'=id::text AND data->>'poolId'=pool_id::text AND data->>'competitionId'=competition_id::text AND (data->>'revision')::integer=revision) IS TRUE)
);
CREATE UNIQUE INDEX prize_current_proposal ON fantasy.prize_proposals(pool_id) WHERE data->>'state'<>'voided';
`,
} as const;
