import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  gameweekSchema,
  competitionRulesSchema,
  historicalRuleCommandSchema,
  historicalRuleSelectionSchema,
  historicalRuleSettingsSchema,
  type HistoricalRuleSelection,
  type HistoricalRuleCommand,
} from '@fantasy/contracts';
import { requireCapability, type Principal } from './authorization.ts';
import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { calculateResultImpact } from './result-impact.ts';
import { visibleGroupImpact } from './group-result-impact.ts';
import { hasPrizeReadScope } from './prize-access.ts';
import { lockResultDependencies } from './result-dependency-locks.ts';
import { publishGameweekWithinTransaction } from './results.ts';
import { CommandRejected } from './errors.ts';
const digest = (value: object) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function proposalWithinTransaction(
  tx: Transaction<Database>,
  selection: HistoricalRuleSelection,
) {
  const round = gameweekSchema.parse(
    (
      await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', selection.gameweekId)
        .executeTakeFirstOrThrow()
    ).data,
  );
  if (
    round.status === 'upcoming' ||
    round.resultRevision < 1 ||
    round.resultRevision !== selection.expectedResultRevision
  )
    throw new CommandRejected('results-changed');
  const competition = (
    await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', round.competitionId)
      .executeTakeFirstOrThrow()
  ).data;
  const rounds = await tx
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', round.competitionId)
    .execute();
  const beforeSettings = historicalRuleSettingsSchema.parse({
    scoring: historicalRuleSettingsSchema.shape.scoring
      .strip()
      .parse(round.rules.scoring),
    gameweek: round.rules.gameweek,
  });
  if (digest(beforeSettings) === digest(selection.settings))
    throw new CommandRejected('replay-no-change');
  const version =
    Math.max(
      competition.rules.version,
      ...rounds.map((r) => r.data.rules.version),
    ) + 1;
  const rules = competitionRulesSchema.parse({
    ...round.rules,
    version,
    scoring: {
      ...selection.settings.scoring,
      version: `historical-${round.id}-${String(version)}`,
    },
    gameweek: selection.settings.gameweek,
  });
  const candidate = { ...round, rules };
  const impact = await calculateResultImpact(tx, candidate);
  const snapshots = await tx
    .selectFrom('entry_snapshots')
    .select(['entry_id', 'payload'])
    .where('gameweek_id', '=', round.id)
    .orderBy('entry_id')
    .execute();
  const previous = await tx
    .selectFrom('round_calculations')
    .select('payload')
    .where('gameweek_id', '=', round.id)
    .where('revision', '=', round.resultRevision)
    .executeTakeFirst();
  if (!previous) throw new CommandRejected('replay-source-unavailable');
  const fingerprint = digest({
    version: 'historical-rules-v1',
    selection,
    originalRound: round,
    competitionRevision: competition.revision,
    candidateRules: rules,
    previous: previous.payload,
    snapshots,
    impact: impact.fingerprint,
  });
  return {
    round,
    candidate,
    impact,
    fingerprint,
    beforeSettings,
    canApply:
      impact.settled &&
      impact.rankings !== null &&
      snapshots.length > 0 &&
      impact.changes.every((c) => c.before !== null && c.after !== null),
  };
}
async function authorize(
  tx: Transaction<Database>,
  principal: Principal,
  gameweekId: string,
) {
  const context = await loadCurrentStaffWriteContext(tx, principal);
  const reference = await tx
    .selectFrom('gameweeks')
    .select('competition_id')
    .where('id', '=', gameweekId)
    .executeTakeFirst();
  if (!reference) throw new CommandRejected('gameweek-unavailable');
  requireCapability(
    principal,
    context.grants,
    'results.replay',
    reference.competition_id,
    context.now,
    true,
  );
  return { ...context, competitionId: reference.competition_id };
}
export async function previewHistoricalRules(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: HistoricalRuleSelection,
) {
  const selection = historicalRuleSelectionSchema.parse(input);
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const authority = await authorize(tx, principal, selection.gameweekId);
      const proposal = await proposalWithinTransaction(tx, selection);
      const { groupImpact, prizeImpacts, ...impact } = proposal.impact;
      return {
        selection,
        originalRules: proposal.round.rules,
        proposedRules: proposal.candidate.rules,
        fingerprint: proposal.fingerprint,
        canApply: proposal.canApply,
        impact: {
          ...impact,
          groupImpact: await visibleGroupImpact(
            tx,
            groupImpact,
            principal.accountId,
          ),
          prizeImpacts: hasPrizeReadScope(
            authority.grants,
            authority.competitionId,
          )
            ? prizeImpacts
            : null,
        },
      };
    });
}
export async function executeHistoricalRules(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: HistoricalRuleCommand,
) {
  const command = historicalRuleCommandSchema.parse(input),
    commandFingerprint = digest(command);
  return db.transaction().execute(async (tx) => {
    const authority = await authorize(
      tx,
      principal,
      command.selection.gameweekId,
    );
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
      if (receipt.fingerprint !== commandFingerprint)
        throw new CommandRejected('idempotency-conflict');
      return gameweekSchema.parse(receipt.result);
    }
    await tx
      .selectFrom('competitions')
      .select('id')
      .where('id', '=', authority.competitionId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const round = gameweekSchema.parse(
      (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', command.selection.gameweekId)
          .forUpdate()
          .executeTakeFirstOrThrow()
      ).data,
    );
    await lockResultDependencies(tx, round);
    const proposal = await proposalWithinTransaction(tx, command.selection);
    if (proposal.fingerprint !== command.expectedFingerprint)
      throw new CommandRejected('preview-changed');
    if (!proposal.canApply) throw new CommandRejected('replay-incomplete');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
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
          ...proposal.candidate,
          status: 'provisional',
          finalizedAt: null,
          lastMaterialChangeAt: now.toISOString(),
        },
      })
      .where('id', '=', round.id)
      .execute();
    await publishGameweekWithinTransaction(tx, round.id);
    const updated = gameweekSchema.parse(
      (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', round.id)
          .executeTakeFirstOrThrow()
      ).data,
    );
    if (updated.resultRevision !== round.resultRevision + 1)
      throw new Error('Historical replay did not publish a new revision');
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'results.rules-replayed',
        scope_id: round.id,
        reason: command.reason,
        payload: {
          previousRevision: round.resultRevision,
          resultRevision: updated.resultRevision,
          previousRules: round.rules,
          rules: updated.rules,
          reviewedFingerprint: proposal.fingerprint,
          reviewedFactsFingerprint: proposal.impact.factsFingerprint,
          snapshotsPreserved: true,
        },
      })
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint: commandFingerprint,
        accepted_at: now,
        result: updated,
      })
      .execute();
    return updated;
  });
}

/** Scoped metadata for retained calculations; raw fact evidence and participant state stay server-side. */
export async function readHistoricalRulesHistory(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  gameweekId: string,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      await authorize(tx, principal, gameweekId);
      const rows = await tx
        .selectFrom('round_calculations')
        .select([
          'revision',
          sql`payload->'rules'`.as('rules'),
          sql<string>`payload->>'calculatedAt'`.as('calculatedAt'),
        ])
        .where('gameweek_id', '=', gameweekId)
        .orderBy('revision', 'desc')
        .limit(20)
        .execute();
      return rows.map((row) => ({
        ...row,
        rules: competitionRulesSchema.parse(row.rules),
      }));
    });
}
