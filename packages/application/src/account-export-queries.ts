import { sql, type RawBuilder } from 'kysely';
import type { AccountExportScope } from '@fantasy/contracts';
export interface ArchiveRow {
  cursor: string;
  data: unknown;
}
/** Each query projects only owner-visible fields; credentials, invitation secrets and moderation evidence have no export query. */
export function accountExportQueries(
  accountId: string,
  scope: AccountExportScope,
  asOf: Date,
) {
  const competition = (column: string) =>
    sql<boolean>`(${scope.competitionId}::uuid IS NULL OR ${sql.ref(column)}=${scope.competitionId}::uuid)`;
  const history = (field: RawBuilder<unknown>) =>
    sql<boolean>`(${scope.historyFrom}::timestamptz IS NULL OR ${field}>=${scope.historyFrom}::timestamptz) AND ${field}<=${scope.historyUntil && Date.parse(scope.historyUntil) < asOf.getTime() ? scope.historyUntil : asOf.toISOString()}::timestamptz`;
  const queries: readonly {
    kind: string;
    page: (cursor: string) => RawBuilder<ArchiveRow>;
  }[] = [
    {
      kind: 'entry',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT e.id::text AS cursor,e.data FROM fantasy.entries e WHERE e.account_id=${accountId} AND ${competition('e.competition_id')} AND e.id::text>${cursor} ORDER BY e.id::text LIMIT 100`,
    },
    {
      kind: 'locked-squad',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT (s.entry_id::text||':'||s.gameweek_id::text) AS cursor,jsonb_build_object('entryId',s.entry_id,'competitionId',s.competition_id,'gameweekId',s.gameweek_id,'lockedAt',s.locked_at,'squad',s.payload) AS data FROM fantasy.entry_snapshots s JOIN fantasy.entries e ON e.id=s.entry_id WHERE e.account_id=${accountId} AND ${competition('s.competition_id')} AND ${history(sql.ref('s.locked_at'))} AND (s.entry_id::text||':'||s.gameweek_id::text)>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'entry-result',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT (r.entry_id::text||':'||r.gameweek_id::text) AS cursor,jsonb_build_object('entryId',r.entry_id,'competitionId',r.competition_id,'gameweekId',r.gameweek_id,'revision',r.revision,'publishedAt',r.published_at,'result',r.payload) AS data FROM fantasy.entry_results r JOIN fantasy.entries e ON e.id=r.entry_id WHERE e.account_id=${accountId} AND ${competition('r.competition_id')} AND ${history(sql.ref('r.published_at'))} AND (r.entry_id::text||':'||r.gameweek_id::text)>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'group-membership',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT (m.group_id::text||':'||m.entry_id::text) AS cursor,jsonb_build_object('groupId',m.group_id,'groupName',g.data->'name','entryId',m.entry_id,'competitionId',m.competition_id,'status',m.status,'joinedAt',m.joined_at,'changedAt',m.changed_at) AS data FROM fantasy.group_memberships m JOIN fantasy.league_groups g ON g.id=m.group_id WHERE m.account_id=${accountId} AND ${competition('m.competition_id')} AND (m.group_id::text||':'||m.entry_id::text)>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'group-membership-event',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT h.sequence::text AS cursor,jsonb_build_object('groupId',h.group_id,'entryId',h.entry_id,'status',h.status,'occurredAt',h.occurred_at) AS data FROM fantasy.group_membership_history h JOIN fantasy.entries e ON e.id=h.entry_id WHERE e.account_id=${accountId} AND ${competition('e.competition_id')} AND ${history(sql.ref('h.occurred_at'))} AND h.sequence::text>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'own-chat-message',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT m.sequence::text AS cursor,jsonb_build_object('messageId',m.id,'groupId',m.group_id,'createdAt',m.created_at,'removedAt',m.removed_at,'body',CASE WHEN m.removed_at IS NULL THEN m.body ELSE NULL END) AS data FROM fantasy.chat_messages m JOIN fantasy.league_groups g ON g.id=m.group_id WHERE m.account_id=${accountId} AND m.created_at>${new Date(asOf.getTime() - 90 * 86400000)} AND ${competition('g.competition_id')} AND ${history(sql.ref('m.created_at'))} AND m.sequence::text>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'chat-preference',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT p.group_id::text AS cursor,jsonb_build_object('groupId',p.group_id,'muted',p.muted) AS data FROM fantasy.chat_preferences p JOIN fantasy.league_groups g ON g.id=p.group_id WHERE p.account_id=${accountId} AND ${competition('g.competition_id')} AND p.group_id::text>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'blocked-account',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT b.blocked_id AS cursor,jsonb_build_object('blockedAccountId',b.blocked_id) AS data FROM fantasy.chat_blocks b WHERE b.account_id=${accountId} AND b.blocked_id>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'achievement',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT a.id::text AS cursor,jsonb_build_object('grant',a.data,'name',d.data->'name') AS data FROM fantasy.achievement_grants a JOIN fantasy.achievement_definitions d ON d.id=a.definition_id AND d.version=a.version WHERE a.account_id=${accountId} AND ${competition('a.competition_id')} AND ${history(sql`(a.data->>'awardedAt')::timestamptz`)} AND a.id::text>${cursor} ORDER BY cursor LIMIT 100`,
    },
    {
      kind: 'fulfilled-award',
      page: (cursor) =>
        sql<ArchiveRow>`SELECT (p.id::text||':'||a.ordinality::text) AS cursor,jsonb_build_object('proposalId',p.id,'poolId',p.pool_id,'competitionId',p.competition_id,'fulfilledAt',p.data->'fulfilledAt','award',a.value) AS data FROM fantasy.prize_proposals p CROSS JOIN LATERAL jsonb_array_elements(p.data->'preview'->'awards') WITH ORDINALITY a(value,ordinality) WHERE p.data->>'state'='fulfilled' AND a.value->>'accountId'=${accountId} AND ${competition('p.competition_id')} AND ${history(sql`(p.data->>'fulfilledAt')::timestamptz`)} AND (p.id::text||':'||a.ordinality::text)>${cursor} ORDER BY cursor LIMIT 100`,
    },
  ];
  return queries;
}
