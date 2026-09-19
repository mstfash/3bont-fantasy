export const chatMigration = {
  id: '0010-chat',
  sql: `
 CREATE TABLE fantasy.chat_moderation_events(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES fantasy.league_groups(id),actor_id text NOT NULL,action text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
 CREATE TABLE fantasy.chat_settings(group_id uuid PRIMARY KEY REFERENCES fantasy.league_groups(id),data jsonb NOT NULL);
 CREATE TABLE fantasy.chat_messages(
 id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,group_id uuid NOT NULL REFERENCES fantasy.league_groups(id),
 account_id text NOT NULL REFERENCES fantasy.accounts(id),body text NOT NULL CHECK(length(body)<=1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),removed_at timestamptz,
 CHECK(removed_at IS NULL OR body=''),UNIQUE(id,group_id));
 CREATE INDEX chat_room_timeline ON fantasy.chat_messages(group_id,sequence DESC);
 CREATE INDEX chat_message_expiry ON fantasy.chat_messages(created_at);
 CREATE TABLE fantasy.chat_post_events(account_id text NOT NULL REFERENCES fantasy.accounts(id),occurred_at timestamptz NOT NULL);
 CREATE INDEX chat_rate_window ON fantasy.chat_post_events(account_id,occurred_at);
 CREATE TABLE fantasy.chat_preferences(group_id uuid NOT NULL REFERENCES fantasy.league_groups(id),account_id text NOT NULL REFERENCES fantasy.accounts(id),muted boolean NOT NULL,PRIMARY KEY(group_id,account_id));
 CREATE TABLE fantasy.chat_blocks(account_id text NOT NULL REFERENCES fantasy.accounts(id),blocked_id text NOT NULL REFERENCES fantasy.accounts(id),PRIMARY KEY(account_id,blocked_id),CHECK(account_id<>blocked_id));
 CREATE TABLE fantasy.chat_timeouts(group_id uuid NOT NULL REFERENCES fantasy.league_groups(id),account_id text NOT NULL REFERENCES fantasy.accounts(id),until_at timestamptz NOT NULL,reason text NOT NULL,actor_id text NOT NULL,PRIMARY KEY(group_id,account_id));
 CREATE TABLE fantasy.chat_reports(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES fantasy.league_groups(id),message_id uuid NOT NULL,reporter_id text NOT NULL REFERENCES fantasy.accounts(id),author_id text NOT NULL,body text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,state text NOT NULL CHECK(state IN('open','actioned','dismissed')),resolved_by text,resolution text,resolved_at timestamptz,UNIQUE(message_id,reporter_id));
 CREATE INDEX chat_report_queue ON fantasy.chat_reports(group_id,state,created_at);
 `,
} as const;
