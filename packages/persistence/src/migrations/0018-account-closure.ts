export const accountClosureMigration = {
  id: '0018-account-closure',
  sql: `ALTER TABLE fantasy.accounts ADD COLUMN closed_at timestamptz;`,
} as const;
