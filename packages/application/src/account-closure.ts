import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  accountClosureCommandSchema,
  type AccountClosureCommand,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { accountClosurePreviewWithinTransaction } from './account-closure-preview.ts';
export async function executeAccountClosure(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: AccountClosureCommand,
) {
  const command = accountClosureCommandSchema.parse(input);
  if (!principal.emailVerified) throw new AccessDenied();
  return db.transaction().execute(async (tx) => {
    await sql`SET LOCAL lock_timeout='5s'`.execute(tx);
    await sql`SET LOCAL statement_timeout='15s'`.execute(tx);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-management'},0))`.execute(
      tx,
    );
    const competitions = await tx
      .selectFrom('entries')
      .select('competition_id')
      .distinct()
      .where('account_id', '=', principal.accountId)
      .orderBy('competition_id')
      .execute();
    const ids = competitions.map((c) => c.competition_id);
    if (ids.length)
      await tx
        .selectFrom('competitions')
        .select('id')
        .where('id', 'in', ids)
        .orderBy('id')
        .forUpdate()
        .execute();
    const account = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', principal.accountId)
      .forUpdate()
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
    const age = now.getTime() - principal.authenticatedAt.getTime();
    if (!Number.isFinite(age) || age < 0 || age > 15 * 60000)
      throw new CommandRejected('closure-fresh-sign-in-required');
    const identity = (
      await sql<{
        id: string;
      }>`SELECT id FROM "user" WHERE id=${principal.accountId} AND "emailVerified"=true FOR UPDATE`.execute(
        tx,
      )
    ).rows[0];
    if (!identity) throw new AccessDenied();
    const preview = await accountClosurePreviewWithinTransaction(
      tx,
      principal.accountId,
      account.display_name,
    );
    if (
      preview.fingerprint !== command.expectedFingerprint ||
      preview.entries.some((e) => !ids.includes(e.competitionId))
    )
      throw new CommandRejected('closure-review-changed');
    if (!preview.canClose) throw new CommandRejected('closure-blocked');
    await tx
      .updateTable('accounts')
      .set({ closed_at: now, display_name: 'حساب مغلق / Closed participant' })
      .where('id', '=', principal.accountId)
      .execute();
    for (const entry of preview.entries) {
      const name = `فريق مغلق / Closed squad ${entry.id.slice(0, 8)}`;
      await sql`UPDATE fantasy.entries SET revision=revision+1,data=jsonb_set(jsonb_set(data,'{name}',to_jsonb(${name}::text)),'{revision}',to_jsonb(revision+1)) WHERE id=${entry.id}::uuid`.execute(
        tx,
      );
    }
    await tx
      .updateTable('chat_messages')
      .set({ body: '', removed_at: now })
      .where('account_id', '=', principal.accountId)
      .where('removed_at', 'is', null)
      .execute();
    await tx
      .deleteFrom('chat_preferences')
      .where('account_id', '=', principal.accountId)
      .execute();
    await tx
      .deleteFrom('chat_blocks')
      .where((eb) =>
        eb.or([
          eb('account_id', '=', principal.accountId),
          eb('blocked_id', '=', principal.accountId),
        ]),
      )
      .execute();
    await tx
      .deleteFrom('chat_post_events')
      .where('account_id', '=', principal.accountId)
      .execute();
    await tx
      .deleteFrom('group_handovers')
      .where((eb) =>
        eb.or([
          eb('from_account_id', '=', principal.accountId),
          eb('to_account_id', '=', principal.accountId),
        ]),
      )
      .execute();
    await tx
      .deleteFrom('account_exports')
      .where('account_id', '=', principal.accountId)
      .execute();
    await tx
      .deleteFrom('staff_session_proofs')
      .where('account_id', '=', principal.accountId)
      .execute();
    await tx
      .deleteFrom('staff_verification_limits')
      .where('account_id', '=', principal.accountId)
      .execute();
    await tx
      .deleteFrom('commands')
      .where('actor_id', '=', principal.accountId)
      .execute();
    await sql`DELETE FROM "session" WHERE "userId"=${principal.accountId}`.execute(
      tx,
    );
    await sql`DELETE FROM "account" WHERE "userId"=${principal.accountId}`.execute(
      tx,
    );
    await sql`DELETE FROM "twoFactor" WHERE "userId"=${principal.accountId}`.execute(
      tx,
    );
    await sql`DELETE FROM "user" WHERE id=${principal.accountId}`.execute(tx);
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'account.closed',
        scope_id: principal.accountId,
        reason: 'Participant confirmed account closure',
        payload: {
          commandId: command.commandId,
          closedAt: now.toISOString(),
          entries: preview.entries.map((e) => e.id),
          removedMessages: preview.messageCount,
          purgedArchives: preview.archiveCount,
        },
      })
      .execute();
    return { closedAt: now.toISOString() };
  });
}
