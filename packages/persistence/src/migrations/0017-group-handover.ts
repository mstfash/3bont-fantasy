export const groupHandoverMigration = {
  id: '0017-group-handover',
  sql: `
CREATE TABLE fantasy.group_handovers(
 group_id uuid PRIMARY KEY REFERENCES fantasy.league_groups(id) ON DELETE CASCADE,
 id uuid NOT NULL UNIQUE,from_account_id text NOT NULL REFERENCES fantasy.accounts(id),to_account_id text NOT NULL REFERENCES fantasy.accounts(id),
 recipient_entry_id uuid NOT NULL REFERENCES fantasy.entries(id),group_revision integer NOT NULL CHECK(group_revision>0),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 CHECK(from_account_id<>to_account_id)
);
CREATE INDEX group_handovers_recipient ON fantasy.group_handovers(to_account_id,expires_at);
`,
} as const;
