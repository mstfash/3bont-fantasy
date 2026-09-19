import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Insertable, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  gameweekSchema,
  lockedEntrySchema,
  resultCommandSchema,
  roundCalculationSchema,
  type ResultCommand,
} from '@fantasy/contracts';
import { calculateEntryResult } from './entry-calculation.ts';
import { calculateResultImpact } from './result-impact.ts';
import { lockResultDependencies } from './result-dependency-locks.ts';
import { calculateRoundInputs } from './round-inputs.ts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

export async function publishGameweekResults(
  db: ReturnType<typeof createDatabase>,
  gameweekId: string,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await publishSnapshot(db, gameweekId);
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Error &&
        'code' in error &&
        error.code === '40001'
      )
        continue;
      throw error;
    }
  }
}
async function publishSnapshot(
  db: ReturnType<typeof createDatabase>,
  gameweekId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      return publishGameweekWithinTransaction(tx, gameweekId);
    });
}

/** Canonical atomic publication; callers must hold authority before entering when acting for staff. */
export async function publishGameweekWithinTransaction(
  tx: Transaction<Database>,
  gameweekId: string,
) {
  const reference = await tx
    .selectFrom('gameweeks')
    .select('competition_id')
    .where('id', '=', gameweekId)
    .executeTakeFirst();
  if (!reference) throw new CommandRejected('gameweek-unavailable');
  await tx
    .selectFrom('competitions')
    .select('id')
    .where('id', '=', reference.competition_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const row = await tx
    .selectFrom('gameweeks')
    .select('data')
    .where('id', '=', gameweekId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const round = gameweekSchema.parse(row.data);
  if (round.status === 'upcoming')
    return { status: 'skipped' as const, revision: 0 };
  const inputs = await calculateRoundInputs(tx, round);
  const previous = await tx
    .selectFrom('round_calculations')
    .select('payload')
    .where('gameweek_id', '=', gameweekId)
    .where('revision', '=', round.resultRevision)
    .executeTakeFirst();
  const changed =
    !previous || previous.payload.fingerprint !== inputs.fingerprint;
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  if (round.status === 'finalized' || round.status === 'review') {
    if (changed) {
      await tx
        .insertInto('result_reviews')
        .values({
          id: randomUUID(),
          gameweek_id: gameweekId,
          reason: `late-football-correction:${inputs.fingerprint}`,
          status: 'open',
          evidence_id: null,
          resolved_at: null,
          resolved_by: null,
        })
        .onConflict((oc) =>
          oc
            .columns(['gameweek_id', 'reason'])
            .where('status', '=', 'open')
            .doNothing(),
        )
        .execute();
      if (round.status !== 'review')
        await tx
          .updateTable('gameweeks')
          .set({ data: { ...round, status: 'review' } })
          .where('id', '=', gameweekId)
          .execute();
    }
    return {
      status: changed ? ('review' as const) : ('unchanged' as const),
      revision: round.resultRevision,
    };
  }
  let revision = round.resultRevision;
  let materialAt = round.lastMaterialChangeAt;
  if (changed) {
    revision++;
    materialAt = now.toISOString();
    const snapshots = await tx
      .selectFrom('entry_snapshots')
      .selectAll()
      .where('gameweek_id', '=', gameweekId)
      .execute();
    const playersById = new Map(inputs.players.map((p) => [p.footballerId, p]));
    let batch: Insertable<Database['entry_results']>[] = [];
    for (const snapshot of snapshots) {
      const locked = lockedEntrySchema.parse(snapshot.payload);
      const result = calculateEntryResult(
        locked,
        round,
        playersById,
        inputs.settled,
      );
      if (result.status === 'blocked')
        throw new CommandRejected(`snapshot-cannot-score:${result.reason}`);
      const payload = result.payload;
      batch.push({
        entry_id: snapshot.entry_id,
        competition_id: snapshot.competition_id,
        gameweek_id: gameweekId,
        revision,
        points: payload.total,
        payload,
        published_at: now,
      });
      if (batch.length >= 100) {
        await tx.insertInto('entry_results').values(batch).execute();
        batch = [];
      }
    }
    if (batch.length > 0)
      await tx.insertInto('entry_results').values(batch).execute();
    const calculation = roundCalculationSchema.parse({
      rules: round.rules,
      calculationVersion: 'round-v1',
      gameweekId,
      revision,
      fingerprint: inputs.fingerprint,
      calculatedAt: now.toISOString(),
      settled: inputs.settled,
      issues: inputs.issues,
      players: inputs.players,
    });
    await tx
      .insertInto('round_calculations')
      .values({
        gameweek_id: gameweekId,
        revision,
        fingerprint: inputs.fingerprint,
        payload: calculation,
      })
      .execute();
  }
  const unresolvedReview = await tx
    .selectFrom('result_reviews')
    .select('id')
    .where('gameweek_id', '=', gameweekId)
    .where('status', '=', 'open')
    .executeTakeFirst();
  const finalizable =
    inputs.settled &&
    !unresolvedReview &&
    materialAt !== null &&
    now.getTime() >=
      Date.parse(materialAt) + round.rules.correctionWindowHours * 3600_000;
  const updated = gameweekSchema.parse({
    ...round,
    status: finalizable ? 'finalized' : 'provisional',
    resultRevision: revision,
    lastMaterialChangeAt: materialAt,
    finalizedAt: finalizable ? now.toISOString() : null,
    issues: inputs.issues,
  });
  await tx
    .updateTable('gameweeks')
    .set({ data: updated })
    .where('id', '=', gameweekId)
    .execute();
  if (changed || finalizable)
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: 'system:scoring',
        action: finalizable ? 'results.finalized' : 'results.published',
        scope_id: gameweekId,
        reason: null,
        payload: {
          revision,
          fingerprint: inputs.fingerprint,
          settled: inputs.settled,
        },
      })
      .execute();
  return { status: updated.status, revision };
}

export async function publishDueResults(db: ReturnType<typeof createDatabase>) {
  const rounds = await db
    .selectFrom('gameweeks')
    .select('id')
    .where(sql<string>`data->>'status'`, '!=', 'upcoming')
    .orderBy('deadline')
    .execute();
  let published = 0;
  const failed: { gameweekId: string; code: string }[] = [];
  for (const round of rounds) {
    try {
      const result = await publishGameweekResults(db, round.id);
      if (result.status === 'provisional' || result.status === 'finalized')
        published++;
    } catch (error) {
      failed.push({
        gameweekId: round.id,
        code: error instanceof CommandRejected ? error.code : 'scoring-failed',
      });
    }
  }
  return { inspected: rounds.length, published, failed };
}

/** Reopening retains the published revision until a replacement is committed atomically. */
export async function executeResultCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ResultCommand,
) {
  const command = resultCommandSchema.parse(input);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    const reference = await tx
      .selectFrom('gameweeks')
      .select('competition_id')
      .where('id', '=', command.gameweekId)
      .executeTakeFirst();
    if (!reference) throw new CommandRejected('gameweek-unavailable');
    await requireCurrentStaffWrite(
      tx,
      principal,
      'competition.manage',
      reference.competition_id,
    );
    requireCapability(
      principal,
      grants,
      'competition.manage',
      reference.competition_id,
      new Date(),
      true,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return gameweekSchema.parse(cached.result);
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
          .where('id', '=', command.gameweekId)
          .forUpdate()
          .executeTakeFirstOrThrow()
      ).data,
    );
    if (
      !['finalized', 'review'].includes(round.status) ||
      round.resultRevision !== command.expectedResultRevision
    )
      throw new CommandRejected('results-changed');
    // Imports and overrides take a fixture-row update lock. Hold shared locks
    // while validating the exact preview, without an old snapshot before receipt lookup.
    await lockResultDependencies(tx, round);
    const candidate = await calculateResultImpact(tx, round);
    if (candidate.fingerprint !== command.expectedFingerprint)
      throw new CommandRejected('preview-changed');
    const clock = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!clock) throw new Error('Database clock unavailable');
    const updated = {
      ...round,
      status: 'provisional' as const,
      finalizedAt: null,
      lastMaterialChangeAt: clock.toISOString(),
    };
    await tx
      .updateTable('result_reviews')
      .set({
        status: 'resolved',
        resolved_at: clock,
        resolved_by: principal.accountId,
      })
      .where('gameweek_id', '=', round.id)
      .where('status', '=', 'open')
      .execute();
    await tx
      .updateTable('gameweeks')
      .set({ data: updated })
      .where('id', '=', round.id)
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: clock,
        result: updated,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'results.reopened',
        scope_id: round.id,
        reason: command.reason,
        payload: {
          previousRevision: round.resultRevision,
          reviewedFingerprint: command.expectedFingerprint,
          reviewedFactsFingerprint: candidate.factsFingerprint,
          impact: {
            changedScores: candidate.changes.filter(
              (row) => row.before !== row.after,
            ).length,
            changedRanks:
              candidate.rankings?.filter(
                (row) => row.beforeRank !== row.afterRank,
              ).length ?? null,
            groupScopes: candidate.groupImpact.groups.length,
            headToHeadEditions: candidate.groupImpact.groups.reduce(
              (sum, group) => sum + group.headToHead.length,
              0,
            ),
            prizeProjections: {
              available: candidate.prizeImpacts.filter((p) => p.after !== null)
                .length,
              held: candidate.prizeImpacts.filter((p) => p.after === null)
                .length,
            },
            prizes: candidate.prizes,
          },
        },
      })
      .execute();
    return updated;
  });
}
