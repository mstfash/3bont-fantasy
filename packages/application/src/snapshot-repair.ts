import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  gameweekSchema,
  snapshotRepairSchema,
  snapshotRepairCommandSchema,
  snapshotRepairSelectionSchema,
  type SnapshotRepairSelection,
  type SnapshotRepairCommand,
} from '@fantasy/contracts';
import { requireCapability, type Principal } from './authorization.ts';
import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { calculateResultImpact } from './result-impact.ts';
import { visibleGroupImpact } from './group-result-impact.ts';
import { hasPrizeReadScope } from './prize-access.ts';
import { lockResultDependencies } from './result-dependency-locks.ts';
import {
  reconstructSnapshot,
  snapshotDigest,
} from './snapshot-repair-evidence.ts';
import { publishReviewedCorrection } from './reviewed-result-publication.ts';
import { CommandRejected } from './errors.ts';
type Impact = Awaited<ReturnType<typeof calculateResultImpact>>;
type Evidence = Awaited<ReturnType<typeof reconstructSnapshot>>;
type Preview = {
  selection: SnapshotRepairSelection;
  fingerprint: string;
  canApply: boolean;
  entryName: string;
  before: Evidence['before'];
  after: Evidence['snapshot'];
  repairRevision: number;
  source: Omit<Evidence['source'], 'state' | 'accountId'>;
  impact: Omit<Impact, 'groupImpact' | 'prizeImpacts'> & {
    groupImpact: Awaited<ReturnType<typeof visibleGroupImpact>>;
    prizeImpacts: Impact['prizeImpacts'] | null;
  };
};
class RollbackPreview extends Error {
  readonly preview: Preview;
  constructor(preview: Preview) {
    super('Rollback snapshot repair preview');
    this.preview = preview;
  }
}
async function repair(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  selection: SnapshotRepairSelection,
  command?: SnapshotRepairCommand,
) {
  try {
    return await db.transaction().execute(async (tx) => {
      const authority = await loadCurrentStaffWriteContext(tx, principal);
      const reference = await tx
        .selectFrom('gameweeks')
        .select('competition_id')
        .where('id', '=', selection.gameweekId)
        .executeTakeFirst();
      if (!reference) throw new CommandRejected('gameweek-unavailable');
      requireCapability(
        principal,
        authority.grants,
        'results.replay',
        reference.competition_id,
        authority.now,
        true,
      );
      if (command) {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
          tx,
        );
        const receipt = await tx
          .selectFrom('commands')
          .selectAll()
          .where('actor_id', '=', principal.accountId)
          .where('command_id', '=', command.commandId)
          .executeTakeFirst();
        if (receipt) {
          if (receipt.fingerprint !== snapshotDigest(command))
            throw new CommandRejected('idempotency-conflict');
          return {
            kind: 'applied' as const,
            gameweek: gameweekSchema.parse(receipt.result),
          };
        }
      }
      await tx
        .selectFrom('competitions')
        .select('id')
        .where('id', '=', reference.competition_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const round = gameweekSchema.parse(
        (
          await tx
            .selectFrom('gameweeks')
            .select('data')
            .where('id', '=', selection.gameweekId)
            .forUpdate()
            .executeTakeFirstOrThrow()
        ).data,
      );
      const now = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (!now) throw new Error('Database clock unavailable');
      if (
        round.status === 'upcoming' ||
        Date.parse(round.deadline) > now.getTime() ||
        round.resultRevision !== selection.expectedResultRevision
      )
        throw new CommandRejected('results-changed');
      await lockResultDependencies(tx, round);
      const evidence = await reconstructSnapshot(tx, round, selection.entryId);
      const record = snapshotRepairSchema.parse({
        entryId: selection.entryId,
        gameweekId: round.id,
        revision: evidence.revision,
        resultRevision: round.resultRevision + 1,
        snapshot: evidence.snapshot,
        originalFingerprint: evidence.originalFingerprint,
        source: evidence.source,
        actorId: principal.accountId,
        recordedAt: now.toISOString(),
        reason: command?.reason ?? 'Preview only',
      });
      await tx
        .insertInto('entry_snapshot_repairs')
        .values({
          entry_id: record.entryId,
          gameweek_id: round.id,
          revision: record.revision,
          result_revision: record.resultRevision,
          data: record,
        })
        .execute();
      const impact = await calculateResultImpact(tx, round);
      const fingerprint = snapshotDigest({
        version: 'accepted-snapshot-repair-v1',
        selection,
        round,
        source: evidence.source,
        entryRevision: evidence.entry.revision,
        original: evidence.originalFingerprint,
        before: evidence.beforeFingerprint,
        after: evidence.snapshot,
        repairRevision: record.revision,
        impact: impact.fingerprint,
      });
      const canApply =
        impact.settled &&
        impact.rankings !== null &&
        impact.changes.every((c) => c.before !== null && c.after !== null);
      if (!command) {
        const source = {
          commandId: evidence.source.commandId,
          acceptedAt: evidence.source.acceptedAt,
          entryRevision: evidence.source.entryRevision,
          commandFingerprint: evidence.source.commandFingerprint,
          resultFingerprint: evidence.source.resultFingerprint,
        };
        throw new RollbackPreview({
          selection,
          fingerprint,
          canApply,
          source,
          entryName: evidence.entry.name,
          before: evidence.before,
          after: evidence.snapshot,
          repairRevision: record.revision,
          impact: {
            ...impact,
            groupImpact: await visibleGroupImpact(
              tx,
              impact.groupImpact,
              principal.accountId,
            ),
            prizeImpacts: hasPrizeReadScope(
              authority.grants,
              round.competitionId,
            )
              ? impact.prizeImpacts
              : null,
          },
        });
      }
      if (fingerprint !== command.expectedFingerprint)
        throw new CommandRejected('preview-changed');
      if (!canApply) throw new CommandRejected('replay-incomplete');
      const updated = await publishReviewedCorrection(
        tx,
        round,
        principal.accountId,
        now,
      );
      await tx
        .insertInto('audit_events')
        .values({
          id: randomUUID(),
          actor_id: principal.accountId,
          action: 'results.snapshot-repaired',
          scope_id: round.id,
          reason: command.reason,
          payload: {
            entryId: record.entryId,
            repairRevision: record.revision,
            previousResultRevision: round.resultRevision,
            resultRevision: updated.resultRevision,
            sourceCommandId: record.source.commandId,
            reviewedFingerprint: fingerprint,
            originalFingerprint: record.originalFingerprint,
            subsequentDecisionsPreserved: true,
          },
        })
        .execute();
      await tx
        .insertInto('commands')
        .values({
          actor_id: principal.accountId,
          command_id: command.commandId,
          fingerprint: snapshotDigest(command),
          accepted_at: now,
          result: updated,
        })
        .execute();
      return { kind: 'applied' as const, gameweek: updated };
    });
  } catch (error) {
    if (error instanceof RollbackPreview)
      return { kind: 'preview' as const, preview: error.preview };
    throw error;
  }
}
export async function previewSnapshotRepair(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: SnapshotRepairSelection,
) {
  const result = await repair(
    db,
    principal,
    snapshotRepairSelectionSchema.parse(input),
  );
  if (result.kind !== 'preview')
    throw new Error('Expected read-only repair preview');
  return result.preview;
}
export async function executeSnapshotRepair(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: SnapshotRepairCommand,
) {
  const command = snapshotRepairCommandSchema.parse(input);
  const result = await repair(db, principal, command.selection, command);
  if (result.kind !== 'applied')
    throw new Error('Expected applied snapshot repair');
  return result.gameweek;
}

export async function readSnapshotRepairWorkspace(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  gameweekId: string,
  search: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const authority = await loadCurrentStaffWriteContext(tx, principal);
      const round = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', gameweekId)
          .executeTakeFirst()
      )?.data;
      if (!round) throw new CommandRejected('gameweek-unavailable');
      requireCapability(
        principal,
        authority.grants,
        'results.replay',
        round.competitionId,
        authority.now,
        true,
      );
      let query = tx
        .selectFrom('entry_snapshots')
        .innerJoin('entries', 'entries.id', 'entry_snapshots.entry_id')
        .select('entries.data')
        .where('entry_snapshots.gameweek_id', '=', round.id);
      const q = search.trim().slice(0, 80);
      if (q)
        query = query.where(
          sql<string>`entries.data->>'name'`,
          'ilike',
          `%${q.replace(/[\\%_]/gu, '\\$&')}%`,
        );
      const entries = await query
        .orderBy(sql<string>`entries.data->>'name'`)
        .orderBy('entries.id')
        .limit(51)
        .execute();
      const history = (
        await tx
          .selectFrom('entry_snapshot_repairs')
          .select('data')
          .where('gameweek_id', '=', round.id)
          .orderBy('result_revision', 'desc')
          .limit(20)
          .execute()
      ).map((r) => snapshotRepairSchema.parse(r.data));
      return { entries, history };
    });
}
