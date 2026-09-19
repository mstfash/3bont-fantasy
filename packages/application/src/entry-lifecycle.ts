import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  entrySchema,
  entryLifecycleCommandSchema,
  entryLifecycleResultSchema,
  type EntryLifecycleCommand,
} from '@fantasy/contracts';
import {
  AccessDenied,
  requireEntryOwner,
  type Principal,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { withdrawEditionEntry } from './head-to-head-withdrawal.ts';
export async function executeEntryLifecycle(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: EntryLifecycleCommand,
) {
  const command = entryLifecycleCommandSchema.parse(input);
  if (!principal.emailVerified) throw new AccessDenied();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const competition = await tx
      .selectFrom('competitions')
      .select('id')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!competition) throw new CommandRejected('competition-unavailable');
    const account = await tx
      .selectFrom('accounts')
      .select(['suspended_until', 'closed_at'])
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (
      !now ||
      !account ||
      account.closed_at !== null ||
      (account.suspended_until && account.suspended_until > now)
    )
      throw new AccessDenied();
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return entryLifecycleResultSchema.parse(cached.result);
    }
    const row = await tx
      .selectFrom('entries')
      .select('data')
      .where('id', '=', command.entryId)
      .where('competition_id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new CommandRejected('entry-unavailable');
    const entry = entrySchema.parse(row.data);
    requireEntryOwner(principal, entry.accountId);
    if (entry.revision !== command.expectedRevision)
      throw new CommandRejected('entry-changed');
    const result: {
      entryId: string;
      revision: number;
      retiredAt: string | null;
      discarded: boolean;
    } = {
      entryId: entry.id,
      revision: entry.revision + 1,
      retiredAt: null,
      discarded: command.kind === 'discard-draft',
    };
    if (command.kind === 'discard-draft') {
      if (entry.status !== 'draft' || entry.activatedAt !== null)
        throw new CommandRejected('entry-draft-only');
      const protectedRows = await Promise.all([
        tx
          .selectFrom('entry_snapshots')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
        tx
          .selectFrom('group_memberships')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
        tx
          .selectFrom('entry_results')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
        tx
          .selectFrom('achievement_grants')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
        tx
          .selectFrom('chip_grant_receipts')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
        tx
          .selectFrom('h2h_registrations')
          .select('entry_id')
          .where('entry_id', '=', entry.id)
          .executeTakeFirst(),
      ]);
      if (protectedRows.some(Boolean))
        throw new CommandRejected('entry-draft-has-history');
      await tx.deleteFrom('entries').where('id', '=', entry.id).execute();
    } else {
      if (command.kind === 'retire') {
        if (entry.status !== 'active')
          throw new CommandRejected('entry-already-retired');
        result.retiredAt = now.toISOString();
        await tx
          .insertInto('entry_retirements')
          .values({
            entry_id: entry.id,
            competition_id: entry.competitionId,
            retired_at: now,
          })
          .execute();
        const groups = await tx
          .selectFrom('league_groups')
          .innerJoin(
            'h2h_editions',
            'h2h_editions.group_id',
            'league_groups.id',
          )
          .innerJoin(
            'h2h_registrations',
            'h2h_registrations.edition_id',
            'h2h_editions.id',
          )
          .select('league_groups.id')
          .where('h2h_registrations.entry_id', '=', entry.id)
          .orderBy('league_groups.id')
          .forUpdate('league_groups')
          .execute();
        for (const groupId of new Set(groups.map((g) => g.id))) {
          const editions = await tx
            .selectFrom('h2h_editions')
            .innerJoin(
              'h2h_registrations',
              'h2h_registrations.edition_id',
              'h2h_editions.id',
            )
            .select('h2h_editions.data')
            .where('h2h_editions.group_id', '=', groupId)
            .where('h2h_registrations.entry_id', '=', entry.id)
            .execute();
          for (const edition of editions)
            await withdrawEditionEntry(
              tx,
              edition.data,
              entry.id,
              now,
              'Entry permanently retired',
            );
        }
      } else
        result.retiredAt =
          (
            await tx
              .selectFrom('entry_retirements')
              .select('retired_at')
              .where('entry_id', '=', entry.id)
              .executeTakeFirst()
          )?.retired_at.toISOString() ?? null;
      const updated = entrySchema.parse({
        ...entry,
        revision: result.revision,
        ...(command.kind === 'retire'
          ? { status: 'retired' }
          : { name: command.name }),
      });
      await tx
        .updateTable('entries')
        .set({ data: updated, revision: updated.revision })
        .where('id', '=', entry.id)
        .execute();
    }
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
        action: `entry.${command.kind}`,
        scope_id: entry.id,
        reason: 'Participant reviewed entry lifecycle action',
        payload: {
          competitionId: entry.competitionId,
          beforeStatus: entry.status,
          ...result,
          ...(command.kind === 'rename'
            ? { beforeName: entry.name, afterName: command.name }
            : {}),
        },
      })
      .execute();
    return result;
  });
}
