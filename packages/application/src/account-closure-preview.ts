import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import { accountClosurePreviewSchema } from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
export async function accountClosurePreviewWithinTransaction(
  tx: Transaction<Database>,
  accountId: string,
  displayName: string,
) {
  const entries = (
    await tx
      .selectFrom('entries')
      .select('data')
      .where('account_id', '=', accountId)
      .orderBy('id')
      .execute()
  ).map(({ data: e }) => ({
    id: e.id,
    competitionId: e.competitionId,
    name: e.name,
    status: e.status,
    revision: e.revision,
  }));
  const groups = (
    await tx
      .selectFrom('league_groups')
      .select(['id', 'data'])
      .where('organizer_id', '=', accountId)
      .orderBy('id')
      .execute()
  ).map((r) => ({ id: r.id, name: r.data.name }));
  const staffRoles = (
    await tx
      .selectFrom('staff_grants')
      .select(['id', 'role'])
      .where('account_id', '=', accountId)
      .orderBy('id')
      .execute()
  ).map((r) => r.role);
  const unsettled = await tx
    .selectFrom('prize_proposals')
    .innerJoin('prize_pools', 'prize_pools.id', 'prize_proposals.pool_id')
    .select(['prize_pools.id', 'prize_pools.data'])
    .where(sql<string>`prize_proposals.data->>'state'`, 'in', [
      'prepared',
      'reviewed',
      'approved',
    ])
    .where(
      sql<boolean>`EXISTS (SELECT 1 FROM jsonb_array_elements(prize_proposals.data->'preview'->'awards') AS award WHERE award->>'accountId'=${accountId})`,
    )
    .orderBy('prize_pools.id')
    .execute();
  const corrections = await tx
    .selectFrom('prize_correction_cases')
    .innerJoin(
      'prize_proposals',
      'prize_proposals.id',
      'prize_correction_cases.proposal_id',
    )
    .innerJoin(
      'prize_pools',
      'prize_pools.id',
      'prize_correction_cases.pool_id',
    )
    .select(['prize_pools.id', 'prize_pools.data'])
    .where(sql<string>`prize_correction_cases.data->>'state'`, '=', 'open')
    .where(
      sql<boolean>`(EXISTS (SELECT 1 FROM jsonb_array_elements(prize_proposals.data->'preview'->'candidates') AS candidate WHERE candidate->>'accountId'=${accountId}) OR EXISTS (SELECT 1 FROM jsonb_array_elements(prize_correction_cases.data->'observation'->'preview'->'candidates') AS candidate WHERE candidate->>'accountId'=${accountId}))`,
    )
    .orderBy('prize_pools.id')
    .execute();
  const awards = [
    ...unsettled.map((r) => ({
      poolId: r.id,
      name: r.data.name,
      state: 'unfulfilled' as const,
    })),
    ...corrections.map((r) => ({
      poolId: r.id,
      name: r.data.name,
      state: 'correction-open' as const,
    })),
  ];
  const messages = await tx
    .selectFrom('chat_messages')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('account_id', '=', accountId)
    .where('removed_at', 'is', null)
    .executeTakeFirstOrThrow();
  const archives = await tx
    .selectFrom('account_exports')
    .select('id')
    .where('account_id', '=', accountId)
    .orderBy('id')
    .execute();
  const content = {
    entries,
    groups,
    staffRoles,
    awards,
    messageCount: Number(messages.count),
    archiveCount: archives.length,
    canClose:
      entries.every((e) => e.status === 'retired') &&
      groups.length === 0 &&
      staffRoles.length === 0 &&
      awards.length === 0,
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        accountId,
        displayName,
        ...content,
        archiveIds: archives.map((a) => a.id),
      }),
    )
    .digest('hex');
  return accountClosurePreviewSchema.parse({ ...content, fingerprint });
}
export async function readAccountClosurePreview(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
) {
  if (!principal.emailVerified) throw new AccessDenied();
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const account = await tx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', principal.accountId)
        .executeTakeFirst();
      const now = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (
        !account ||
        !now ||
        account.closed_at !== null ||
        (account.suspended_until && account.suspended_until > now)
      )
        throw new AccessDenied();
      return accountClosurePreviewWithinTransaction(
        tx,
        principal.accountId,
        account.display_name,
      );
    });
}
