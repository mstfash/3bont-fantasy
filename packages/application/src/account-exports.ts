import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  idSchema,
  accountExportCommandSchema,
  accountExportSchema,
  type AccountExportCommand,
} from '@fantasy/contracts';
import { AccessDenied, type Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
async function requireExportAccount(
  tx: Transaction<Database>,
  principal: Principal,
  lock = false,
) {
  if (!principal.emailVerified) throw new AccessDenied();
  let query = tx
    .selectFrom('accounts')
    .select(['id', 'suspended_until', 'closed_at'])
    .where('id', '=', principal.accountId);
  if (lock) query = query.forUpdate();
  const account = await query.executeTakeFirst();
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
  return now;
}
export async function requestAccountExport(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: AccountExportCommand,
) {
  const command = accountExportCommandSchema.parse(input),
    fingerprint = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
  return db.transaction().execute(async (tx) => {
    const now = await requireExportAccount(tx, principal, true);
    const receipt = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      const parsed = z.object({ archiveId: idSchema }).parse(receipt.result);
      const current = await tx
        .selectFrom('account_exports')
        .select('data')
        .where('id', '=', parsed.archiveId)
        .where('account_id', '=', principal.accountId)
        .executeTakeFirst();
      if (!current) throw new CommandRejected('archive-unavailable');
      return { archive: current.data };
    }
    await tx
      .deleteFrom('account_exports')
      .where('account_id', '=', principal.accountId)
      .where('state', '=', 'queued')
      .where('requested_at', '<', new Date(now.getTime() - 86400000))
      .execute();
    const recent = await tx
      .selectFrom('account_exports')
      .select(['state', 'requested_at'])
      .where('account_id', '=', principal.accountId)
      .where('requested_at', '>=', new Date(now.getTime() - 86400000))
      .execute();
    if (recent.some((r) => r.state === 'queued'))
      throw new CommandRejected('archive-already-queued');
    if (recent.length >= 3) throw new CommandRejected('archive-request-limit');
    if (
      command.scope.competitionId &&
      !(await tx
        .selectFrom('entries')
        .select('id')
        .where('account_id', '=', principal.accountId)
        .where('competition_id', '=', command.scope.competitionId)
        .executeTakeFirst())
    )
      throw new CommandRejected('competition-unavailable');
    const archive = accountExportSchema.parse({
      id: randomUUID(),
      accountId: principal.accountId,
      scope: command.scope,
      state: 'queued',
      requestedAt: now.toISOString(),
      completedAt: null,
      expiresAt: null,
      byteLength: null,
      checksum: null,
      errorCode: null,
    });
    await tx
      .insertInto('account_exports')
      .values({
        id: archive.id,
        account_id: principal.accountId,
        state: 'queued',
        requested_at: now,
        expires_at: null,
        data: archive,
      })
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: { archiveId: archive.id },
      })
      .execute();
    return { archive };
  });
}
export async function readAccountExports(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
) {
  return db.transaction().execute(async (tx) => {
    const now = await requireExportAccount(tx, principal);
    const rows = await tx
      .selectFrom('account_exports')
      .select('data')
      .where('account_id', '=', principal.accountId)
      .where('requested_at', '>=', new Date(now.getTime() - 2 * 86400000))
      .orderBy('requested_at', 'desc')
      .limit(10)
      .execute();
    return rows.map((r) => r.data);
  });
}
export async function readAccountExportDownload(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  id: string,
) {
  return db.transaction().execute(async (tx) => {
    const now = await requireExportAccount(tx, principal);
    const row = await tx
      .selectFrom('account_exports')
      .select('data')
      .where('id', '=', id)
      .where('account_id', '=', principal.accountId)
      .executeTakeFirst();
    if (
      !row ||
      row.data.state !== 'ready' ||
      !row.data.expiresAt ||
      Date.parse(row.data.expiresAt) <= now.getTime()
    )
      throw new CommandRejected('archive-unavailable');
    return row.data;
  });
}
export async function readAccountExportChunk(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  id: string,
  sequence: number,
) {
  return db.transaction().execute(async (tx) => {
    const now = await requireExportAccount(tx, principal);
    return tx
      .selectFrom('account_export_chunks')
      .innerJoin(
        'account_exports',
        'account_exports.id',
        'account_export_chunks.export_id',
      )
      .select('account_export_chunks.body')
      .where('account_exports.id', '=', id)
      .where('account_exports.account_id', '=', principal.accountId)
      .where('account_exports.state', '=', 'ready')
      .where('account_exports.expires_at', '>', now)
      .where('account_export_chunks.sequence', '=', sequence)
      .executeTakeFirst();
  });
}
export async function purgeAccountExports(
  db: ReturnType<typeof createDatabase>,
) {
  await db
    .deleteFrom('account_exports')
    .where((eb) =>
      eb.or([
        eb('expires_at', '<=', sql<Date>`clock_timestamp()`),
        eb('requested_at', '<', sql<Date>`clock_timestamp()-interval '2 days'`),
      ]),
    )
    .execute();
}
