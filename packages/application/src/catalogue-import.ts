import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  catalogueImportCommandSchema,
  catalogueImportPreviewSchema,
  catalogueImportResultSchema,
  type CatalogueCommand,
  type CatalogueImportCommand,
  type CatalogueImportPreview,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import {
  applyCatalogueCommandWithinTransaction,
  catalogueFingerprint,
} from './catalogue.ts';
class PreviewRollback extends Error {
  readonly preview: CatalogueImportPreview;
  constructor(preview: CatalogueImportPreview) {
    super('Rollback the validated import preview');
    this.preview = preview;
  }
}
class InvalidRowRollback extends Error {
  readonly itemIndex: number;
  readonly code: string;
  constructor(itemIndex: number, code: string) {
    super('Rollback rejected catalogue import row');
    this.itemIndex = itemIndex;
    this.code = code;
  }
}
const document = (item: CatalogueCommand) =>
  item.kind === 'season'
    ? item.season
    : item.kind === 'club'
      ? item.club
      : item.footballer;
async function currentDocument(
  tx: Transaction<Database>,
  item: CatalogueCommand,
) {
  const id = document(item).id;
  if (item.kind === 'season')
    return (
      (
        await tx
          .selectFrom('seasons')
          .select('data')
          .where('id', '=', id)
          .executeTakeFirst()
      )?.data ?? null
    );
  if (item.kind === 'club')
    return (
      (
        await tx
          .selectFrom('clubs')
          .select('data')
          .where('id', '=', id)
          .executeTakeFirst()
      )?.data ?? null
    );
  return (
    (
      await tx
        .selectFrom('footballers')
        .select('data')
        .where('id', '=', id)
        .executeTakeFirst()
    )?.data ?? null
  );
}
/** Preview deliberately rolls back the same SQL-only use cases that apply executes; no mail/jobs/external side effects occur here. */
export async function executeCatalogueImport(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: CatalogueImportCommand,
) {
  const command = catalogueImportCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  try {
    return await db.transaction().execute(async (tx) => {
      await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'catalogue-import-coordination'},0))`.execute(
        tx,
      );
      const fingerprint = catalogueFingerprint(command);
      if (command.kind === 'apply') {
        if (
          command.manifest.items.some(
            (item) => item.commandId === command.commandId,
          )
        )
          throw new CommandRejected('import-command-id-conflict');
        const receipt = await tx
          .selectFrom('commands')
          .selectAll()
          .where('actor_id', '=', principal.accountId)
          .where('command_id', '=', command.commandId)
          .executeTakeFirst();
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            throw new CommandRejected('idempotency-conflict');
          return {
            kind: 'applied' as const,
            ...catalogueImportResultSchema.parse(receipt.result),
          };
        }
      }
      const order = { season: 0, club: 1, footballer: 2 };
      const items = [...command.manifest.items].sort(
        (a, b) =>
          order[a.kind] - order[b.kind] ||
          document(a).id.localeCompare(document(b).id),
      );
      const changes: CatalogueImportPreview['changes'] = [];
      for (const item of items) {
        const before = await currentDocument(tx, item);
        try {
          await applyCatalogueCommandWithinTransaction(
            tx,
            principal,
            grants,
            item,
          );
        } catch (error) {
          if (error instanceof CommandRejected)
            throw new InvalidRowRollback(
              command.manifest.items.indexOf(item),
              error.code,
            );
          throw error;
        }
        const after = await currentDocument(tx, item);
        if (!after)
          throw new Error('Catalogue write did not persist its document');
        changes.push({
          kind: item.kind,
          id: after.id,
          before,
          after,
          action:
            before === null
              ? 'create'
              : catalogueFingerprint(before) === catalogueFingerprint(after)
                ? 'unchanged'
                : 'update',
        });
      }
      const preview = catalogueImportPreviewSchema.parse({
        fingerprint: catalogueFingerprint({
          manifest: command.manifest,
          changes,
        }),
        changes,
      });
      if (command.kind === 'preview') throw new PreviewRollback(preview);
      if (command.expectedFingerprint !== preview.fingerprint)
        throw new CommandRejected('import-preview-changed');
      const result = { batchId: command.commandId, acceptedRows: items.length };
      await tx
        .insertInto('commands')
        .values({
          actor_id: principal.accountId,
          command_id: command.commandId,
          fingerprint,
          accepted_at: sql<Date>`clock_timestamp()`,
          result,
        })
        .execute();
      await tx
        .insertInto('audit_events')
        .values({
          id: randomUUID(),
          actor_id: principal.accountId,
          action: 'catalogue.batch-imported',
          scope_id: command.commandId,
          reason: command.manifest.sourceEvidenceReference,
          payload: {
            sourceName: command.manifest.sourceName,
            sourceEvidenceReference: command.manifest.sourceEvidenceReference,
            previewFingerprint: preview.fingerprint,
            entities: changes.map((c) => ({
              id: c.id,
              kind: c.kind,
              action: c.action,
            })),
          },
        })
        .execute();
      return { kind: 'applied' as const, ...result };
    });
  } catch (error) {
    if (error instanceof PreviewRollback)
      return { kind: 'preview' as const, ...error.preview };
    if (error instanceof InvalidRowRollback)
      return {
        kind: 'invalid' as const,
        itemIndex: error.itemIndex,
        code: error.code,
      };
    throw error;
  }
}
