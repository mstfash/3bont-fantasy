import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { accountExportSchema, type AccountExport } from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
import { accountExportQueries } from './account-export-queries.ts';
export async function buildNextAccountExport(
  db: ReturnType<typeof createDatabase>,
  limits = { maximumBytes: 100 * 1024 * 1024, maximumMilliseconds: 60_000 },
) {
  if (
    !Number.isSafeInteger(limits.maximumBytes) ||
    limits.maximumBytes < 128 ||
    limits.maximumBytes > 100 * 1024 * 1024 ||
    !Number.isSafeInteger(limits.maximumMilliseconds) ||
    limits.maximumMilliseconds < 1 ||
    limits.maximumMilliseconds > 60_000
  )
    throw new RangeError('Invalid archive resource limits');
  const selection: { archive: AccountExport | null } = { archive: null };
  try {
    return await db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (tx) => {
        await sql`SET LOCAL statement_timeout='20s'`.execute(tx);
        const row = await tx
          .selectFrom('account_exports')
          .selectAll()
          .where('state', '=', 'queued')
          .orderBy('requested_at')
          .forUpdate()
          .skipLocked()
          .limit(1)
          .executeTakeFirst();
        if (!row) return null;
        selection.archive = accountExportSchema.parse(row.data);
        const archive = selection.archive,
          start = performance.now();
        const now = (
          await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
        ).rows[0]?.now;
        if (!now) throw new Error('Database clock unavailable');
        const profile = (
          await sql<{
            id: string;
            displayName: string;
            email: string;
            emailVerified: boolean;
            joinedAt: Date;
          }>`SELECT a.id,a.display_name AS "displayName",u.email,u."emailVerified",a.created_at AS "joinedAt" FROM fantasy.accounts a JOIN "user" u ON u.id=a.id WHERE a.id=${archive.accountId} AND a.closed_at IS NULL AND (a.suspended_until IS NULL OR a.suspended_until<=${now}) AND u."emailVerified"=true`.execute(
            tx,
          )
        ).rows[0];
        if (!profile) throw new CommandRejected('account-unavailable');
        if (Date.parse(archive.requestedAt) < now.getTime() - 86400000)
          throw new CommandRejected('archive-time-limit');
        const hash = createHash('sha256');
        let bytes = 0,
          sequence = 0,
          chunk = '',
          records = 0;
        async function flush() {
          if (!chunk) return;
          await tx
            .insertInto('account_export_chunks')
            .values({ export_id: archive.id, sequence, body: chunk })
            .execute();
          sequence++;
          chunk = '';
        }
        async function write(type: string, data: unknown) {
          if (performance.now() - start > limits.maximumMilliseconds)
            throw new CommandRejected('archive-time-limit');
          const line = JSON.stringify({ type, data }) + '\n',
            length = Buffer.byteLength(line, 'utf8');
          if (bytes + length > limits.maximumBytes)
            throw new CommandRejected('archive-too-large');
          if (Buffer.byteLength(chunk, 'utf8') + length > 128 * 1024)
            await flush();
          chunk += line;
          bytes += length;
          records++;
          hash.update(line, 'utf8');
        }
        await write('metadata', {
          format: '3bont-game-data-v1',
          archiveId: archive.id,
          generatedAt: now.toISOString(),
          scope: archive.scope,
          historySections: [
            'locked-squad',
            'entry-result',
            'group-membership-event',
            'own-chat-message',
            'achievement',
            'fulfilled-award',
          ],
          excluded: [
            'authentication secrets',
            'invitation tokens',
            'other participants private choices',
            'unpublished awards',
            'restricted moderation evidence',
          ],
        });
        await write('profile', profile);
        for (const query of accountExportQueries(
          archive.accountId,
          archive.scope,
          now,
        )) {
          let cursor = '';
          for (;;) {
            const page = (await query.page(cursor).execute(tx)).rows;
            if (page.length === 0) break;
            for (const item of page) {
              await write(query.kind, item.data);
              cursor = item.cursor;
            }
            if (page.length < 100) break;
          }
        }
        await write('completion', { recordsBeforeCompletion: records });
        await flush();
        const completedAt = (
          await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
        ).rows[0]?.now;
        if (!completedAt) throw new Error('Database clock unavailable');
        const ready = accountExportSchema.parse({
          ...archive,
          state: 'ready',
          completedAt: completedAt.toISOString(),
          expiresAt: new Date(completedAt.getTime() + 86400000).toISOString(),
          byteLength: bytes,
          checksum: hash.digest('hex'),
          errorCode: null,
        });
        await tx
          .updateTable('account_exports')
          .set({ state: 'ready', expires_at: ready.expiresAt, data: ready })
          .where('id', '=', archive.id)
          .execute();
        return { id: archive.id, state: 'ready' as const };
      });
  } catch (error) {
    const archive = selection.archive;
    if (!archive) throw error;
    const code =
      error instanceof CommandRejected &&
      [
        'archive-too-large',
        'archive-time-limit',
        'account-unavailable',
      ].includes(error.code)
        ? error.code
        : 'archive-build-failed';
    const failed = accountExportSchema.parse({
      ...archive,
      state: 'failed',
      completedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      errorCode: code,
    });
    const changed = await db
      .updateTable('account_exports')
      .set({ state: 'failed', expires_at: failed.expiresAt, data: failed })
      .where('id', '=', archive.id)
      .where('state', '=', 'queued')
      .returning('id')
      .executeTakeFirst();
    return changed ? { id: archive.id, state: 'failed' as const } : null;
  }
}
