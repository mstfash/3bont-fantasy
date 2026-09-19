import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  profileCommandSchema,
  profileResultSchema,
  type ProfileCommand,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function executeProfileCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: ProfileCommand,
) {
  const command = profileCommandSchema.parse(input);
  if (!principal.emailVerified) throw new AccessDenied();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
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
    const receipt = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return profileResultSchema.parse(receipt.result);
    }
    if (account.display_name !== command.expectedDisplayName)
      throw new CommandRejected('profile-changed');
    // The same connection resolves Better Auth's identity schema; never hard-code public.
    const changed = await sql<{
      id: string;
    }>`UPDATE "user" SET name=${command.displayName},"updatedAt"=clock_timestamp() WHERE id=${principal.accountId} AND "emailVerified"=true RETURNING id`.execute(
      tx,
    );
    if (!changed.rows[0]) throw new AccessDenied();
    await tx
      .updateTable('accounts')
      .set({ display_name: command.displayName })
      .where('id', '=', principal.accountId)
      .execute();
    const result = { accountId: principal.accountId };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'account.profile-updated',
        scope_id: principal.accountId,
        reason: 'Participant updated their display name',
        payload: {},
      })
      .execute();
    return result;
  });
}
