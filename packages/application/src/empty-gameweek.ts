import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  emptyGameweekCommandSchema,
  gameweekSchema,
  type EmptyGameweekCommand,
} from '@fantasy/contracts';
import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { requireCapability, type Principal } from './authorization.ts';
import { calculateResultImpact } from './result-impact.ts';
import { visibleGroupImpact } from './group-result-impact.ts';
import { hasPrizeReadScope } from './prize-access.ts';
import { readFixtureSettlementInputs } from './fixture-settlement-inputs.ts';
import { lockResultDependencies } from './result-dependency-locks.ts';
import { publishGameweekWithinTransaction } from './results.ts';
import { CommandRejected } from './errors.ts';
const digest = (value: object) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Impact = Awaited<ReturnType<typeof calculateResultImpact>>;
type Preview = Omit<Impact, 'groupImpact' | 'prizeImpacts'> & {
  groupImpact: Awaited<ReturnType<typeof visibleGroupImpact>>;
  prizeImpacts: Impact['prizeImpacts'] | null;
};
class RollbackPreview extends Error {
  readonly preview: Preview;
  constructor(preview: Preview) {
    super('Rollback empty round settlement preview');
    this.preview = preview;
  }
}
/** Preview rolls back the same settlement marker used during atomic publication. */
async function settle(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  gameweekId: string,
  command?: EmptyGameweekCommand,
) {
  try {
    return await db.transaction().execute(async (tx) => {
      const reference = await tx
        .selectFrom('gameweeks')
        .select('competition_id')
        .where('id', '=', gameweekId)
        .executeTakeFirst();
      if (!reference) throw new CommandRejected('gameweek-unavailable');
      const authority = await loadCurrentStaffWriteContext(tx, principal);
      requireCapability(
        principal,
        authority.grants,
        'competition.manage',
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
          if (receipt.fingerprint !== digest(command))
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
      const round = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', gameweekId)
          .forUpdate()
          .executeTakeFirstOrThrow()
      ).data;
      const now = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (!now) throw new Error('Database clock unavailable');
      if (
        round.status === 'upcoming' ||
        Date.parse(round.deadline) > now.getTime()
      )
        throw new CommandRejected('empty-gameweek-not-locked');
      if (command && round.resultRevision !== command.expectedResultRevision)
        throw new CommandRejected('results-changed');
      await lockResultDependencies(tx, round);
      const scope = await readFixtureSettlementInputs(tx, round.id);
      if (!scope.zeroPerformance || !scope.evidenceComplete)
        throw new CommandRejected('empty-gameweek-not-evidenced');
      if (scope.approved)
        throw new CommandRejected('empty-gameweek-already-settled');
      await tx
        .insertInto('empty_round_settlements')
        .values({
          gameweek_id: round.id,
          actor_id: principal.accountId,
          fingerprint: scope.fingerprint,
          reason: command?.reason ?? 'Preview only',
          settled_at: now,
        })
        .onConflict((oc) =>
          oc.column('gameweek_id').doUpdateSet({
            actor_id: principal.accountId,
            fingerprint: scope.fingerprint,
            reason: command?.reason ?? 'Preview only',
            settled_at: now,
          }),
        )
        .execute();
      const impact = await calculateResultImpact(tx, round);
      const preview = {
        ...impact,
        fingerprint: digest({
          scope: scope.fingerprint,
          round,
          impact: impact.fingerprint,
        }),
      };
      if (!command)
        throw new RollbackPreview({
          ...preview,
          groupImpact: await visibleGroupImpact(
            tx,
            preview.groupImpact,
            principal.accountId,
          ),
          prizeImpacts: hasPrizeReadScope(
            authority.grants,
            reference.competition_id,
          )
            ? preview.prizeImpacts
            : null,
        });
      if (command.expectedFingerprint !== preview.fingerprint)
        throw new CommandRejected('preview-changed');
      if (!preview.settled || preview.rankings === null)
        throw new CommandRejected('replay-incomplete');
      await tx
        .updateTable('result_reviews')
        .set({
          status: 'resolved',
          resolved_at: now,
          resolved_by: principal.accountId,
        })
        .where('gameweek_id', '=', round.id)
        .where('status', '=', 'open')
        .execute();
      await tx
        .updateTable('gameweeks')
        .set({
          data: {
            ...round,
            status: 'provisional',
            finalizedAt: null,
            lastMaterialChangeAt: now.toISOString(),
          },
        })
        .where('id', '=', round.id)
        .execute();
      await publishGameweekWithinTransaction(tx, round.id);
      const updated = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', round.id)
          .executeTakeFirstOrThrow()
      ).data;
      if (updated.resultRevision !== round.resultRevision + 1)
        throw new Error('Settlement did not publish a complete new revision');
      await tx
        .insertInto('audit_events')
        .values({
          id: randomUUID(),
          actor_id: principal.accountId,
          action: 'results.empty-settled',
          scope_id: round.id,
          reason: command.reason,
          payload: {
            previousRevision: round.resultRevision,
            resultRevision: updated.resultRevision,
            scope: scope.fingerprint,
            reviewedFingerprint: preview.fingerprint,
          },
        })
        .execute();
      await tx
        .insertInto('commands')
        .values({
          actor_id: principal.accountId,
          command_id: command.commandId,
          fingerprint: digest(command),
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
export async function previewEmptyGameweek(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  gameweekId: string,
) {
  const result = await settle(db, principal, gameweekId);
  if (result.kind !== 'preview') throw new Error('Expected read-only preview');
  return result.preview;
}
export async function executeEmptyGameweek(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: EmptyGameweekCommand,
) {
  const command = emptyGameweekCommandSchema.parse(input);
  const result = await settle(db, principal, command.gameweekId, command);
  if (result.kind !== 'applied') throw new Error('Expected publication');
  return result.gameweek;
}
