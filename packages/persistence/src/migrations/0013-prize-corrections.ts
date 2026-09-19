export const prizeCorrectionsMigration = {
  id: '0013-prize-corrections',
  sql: `
ALTER TABLE fantasy.prize_proposals ADD UNIQUE(id,pool_id,competition_id);
CREATE TABLE fantasy.prize_correction_cases(
 id uuid PRIMARY KEY,competition_id uuid NOT NULL,pool_id uuid NOT NULL,proposal_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL,
 FOREIGN KEY(proposal_id,pool_id,competition_id) REFERENCES fantasy.prize_proposals(id,pool_id,competition_id),
 CHECK((data->>'id'=id::text AND data->>'competitionId'=competition_id::text AND data->>'poolId'=pool_id::text AND data->>'proposalId'=proposal_id::text AND (data->>'revision')::integer=revision AND data->>'state' IN ('open','resolved')) IS TRUE)
);
CREATE UNIQUE INDEX prize_one_open_correction ON fantasy.prize_correction_cases(proposal_id) WHERE data->>'state'='open';
CREATE INDEX prize_correction_competition ON fantasy.prize_correction_cases(competition_id,pool_id);
CREATE TABLE fantasy.prize_correction_observations(case_id uuid NOT NULL REFERENCES fantasy.prize_correction_cases(id),revision integer NOT NULL,observed_at timestamptz NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(case_id,revision));
`,
} as const;
