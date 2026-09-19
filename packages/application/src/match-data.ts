import { applyFixtureObservation } from './fixture-observations.ts';
import { freezeFixtureAssignments } from './fixture-assignment-lock.ts';
import { applyFixtureDisposition } from './fixture-dispositions.ts';
import { loadProviderNormalization } from './provider-normalization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  factChangeSchema,
  fixtureSchema,
  matchDataCommandSchema,
  type MatchDataCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

/** Football facts are shared across competitions, so their authors need global data authority. */
export async function executeMatchDataCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: MatchDataCommand,
) {
  const command = matchDataCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    return applyMatchDataWithinTransaction(tx, principal, command, fingerprint);
  });
}

/** SQL-only canonical mutation; a reviewed preview can roll this transaction back in full. */
export async function applyMatchDataWithinTransaction(
  tx: Transaction<Database>,
  principal: Principal,
  command: MatchDataCommand,
  fingerprint: string,
) {
  await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
  if (command.kind === 'disposition') await freezeFixtureAssignments(tx);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
    tx,
  );
  const prior = await tx
    .selectFrom('commands')
    .selectAll()
    .where('actor_id', '=', principal.accountId)
    .where('command_id', '=', command.commandId)
    .executeTakeFirst();
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      throw new CommandRejected('idempotency-conflict');
    return fixtureSchema.parse(prior.result);
  }
  const normalization =
    command.kind === 'import' && command.providerReview
      ? await loadProviderNormalization(tx, command.providerReview.selection)
      : null;
  if (
    normalization &&
    command.kind === 'import' &&
    command.providerReview &&
    (normalization.fingerprint !== command.providerReview.expectedFingerprint ||
      command.providerReview.selection.fixtureId !==
        command.observation.fixture.id)
  )
    throw new CommandRejected('normalization-preview-changed');
  const fixtureId =
    command.kind === 'import'
      ? command.observation.fixture.id
      : command.fixtureId;
  const currentRow = await tx
    .selectFrom('fixtures')
    .select('data')
    .where('id', '=', fixtureId)
    .forUpdate()
    .executeTakeFirst();
  if (!currentRow) throw new CommandRejected('fixture-unavailable');
  const current = fixtureSchema.parse(currentRow.data);
  let updated: typeof current;
  if (command.kind === 'disposition') {
    updated = await applyFixtureDisposition(tx, principal, current, command);
  } else if (command.kind === 'import') {
    const saved = await applyFixtureObservation(
      tx,
      principal.accountId,
      current,
      command,
      normalization && command.providerReview
        ? {
            kind: 'reviewed-provider-report',
            normalization,
            eligibilityReference: command.providerReview.eligibilityReference,
          }
        : null,
    );
    updated = saved.fixture;
  } else {
    const latest = await tx
      .selectFrom('fact_revisions')
      .select('revision')
      .where('fixture_id', '=', fixtureId)
      .where('footballer_id', '=', command.footballerId)
      .orderBy('revision', 'desc')
      .executeTakeFirst();
    if ((latest?.revision ?? 0) !== command.expectedRevision)
      throw new CommandRejected('facts-changed');
    const observation = await tx
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', fixtureId)
      .orderBy('revision', 'desc')
      .executeTakeFirst();
    if (
      !observation?.payload.eligibleFootballerIds.includes(command.footballerId)
    )
      throw new CommandRejected('footballer-not-eligible');
    await tx
      .insertInto('fact_revisions')
      .values({
        id: randomUUID(),
        fixture_id: fixtureId,
        footballer_id: command.footballerId,
        revision: command.expectedRevision + 1,
        evidence_id: null,
        is_override: true,
        actor_id: principal.accountId,
        reason: command.reason,
        payload: factChangeSchema.parse(command.change),
      })
      .execute();
    updated = { ...current, revision: current.revision + 1 };
    await tx
      .updateTable('fixtures')
      .set({ data: updated })
      .where('id', '=', fixtureId)
      .execute();
  }
  await tx
    .insertInto('commands')
    .values({
      actor_id: principal.accountId,
      command_id: command.commandId,
      fingerprint,
      accepted_at: sql<Date>`clock_timestamp()`,
      result: updated,
    })
    .execute();
  await tx
    .insertInto('audit_events')
    .values({
      id: randomUUID(),
      actor_id: principal.accountId,
      action: `match-data.${command.kind}`,
      scope_id: fixtureId,
      reason: command.reason,
      payload: {
        revision: updated.revision,
        ...(command.kind === 'override'
          ? {
              footballerId: command.footballerId,
              change: command.change.kind,
            }
          : command.kind === 'disposition'
            ? {
                disposition: command.choice,
                officialReference: command.officialReference,
              }
            : {
                source: command.source,
                normalizationFingerprint: normalization?.fingerprint ?? null,
              }),
      },
    })
    .execute();
  return updated;
}
