import { loadProviderNormalization } from './provider-normalization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  factChangeSchema,
  fixtureSchema,
  fixtureObservationSchema,
  matchDataCommandSchema,
  type MatchDataCommand,
  type FixtureObservation,
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
    await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
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
      (normalization.fingerprint !==
        command.providerReview.expectedFingerprint ||
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
    let updated = current;
    if (command.kind === 'import') {
      if (current.revision !== command.expectedRevision)
        throw new CommandRejected('fixture-changed');
      const incoming = command.observation;
      if (
        incoming.fixture.seasonId !== current.seasonId ||
        incoming.fixture.homeClubId !== current.homeClubId ||
        incoming.fixture.awayClubId !== current.awayClubId
      )
        throw new CommandRejected('fixture-identity-changed');
      // Resuming an interrupted match keeps the same identity. A replay must be a new fixture.
      if (
        ['live', 'suspended', 'finished'].includes(current.status) &&
        ['scheduled', 'postponed'].includes(incoming.fixture.status)
      )
        throw new CommandRejected('started-fixture-cannot-be-unplayed');
      const eligible =
        incoming.eligibleFootballerIds.length > 0
          ? await tx
              .selectFrom('footballers')
              .select('id')
              .where('season_id', '=', current.seasonId)
              .where('id', 'in', incoming.eligibleFootballerIds)
              .execute()
          : [];
      if (eligible.length !== incoming.eligibleFootballerIds.length)
        throw new CommandRejected('footballer-outside-season');
      if (
        incoming.fixture.status !== 'void' &&
        incoming.eligibilityComplete &&
        eligible.length === 0
      )
        throw new CommandRejected('empty-eligibility-roster');
      const last = await tx
        .selectFrom('fixture_observations')
        .select('payload')
        .where('fixture_id', '=', fixtureId)
        .orderBy('revision', 'desc')
        .executeTakeFirst();
      const evidencePayload =
        normalization && command.providerReview
          ? {
              kind: 'reviewed-provider-report',
              observation: incoming,
              normalization,
              eligibilityReference: command.providerReview.eligibilityReference,
            }
          : incoming;
      const evidenceId = randomUUID();
      await tx
        .insertInto('provider_evidence')
        .values({
          id: evidenceId,
          provider: command.source,
          resource: `fixture:${fixtureId}`,
          checksum: createHash('sha256')
            .update(JSON.stringify(evidencePayload))
            .digest('hex'),
          payload: evidencePayload,
        })
        .execute();
      if (normalization) {
        await tx
          .insertInto('provider_normalization_sources')
          .values(
            normalization.sources.map((source) => ({
              report_evidence_id: evidenceId,
              attempt_id: source.attemptId,
            })),
          )
          .execute();
        await tx
          .insertInto('provider_normalization_mappings')
          .values(
            normalization.mappings.map((mapping) => ({
              report_evidence_id: evidenceId,
              mapping_id: mapping.id,
              revision: mapping.revision,
            })),
          )
          .execute();
      }
      const normalized = canonicalObservation(incoming, current.revision);
      const previous = last
        ? canonicalObservation(last.payload, current.revision)
        : null;
      if (JSON.stringify(normalized) !== JSON.stringify(previous)) {
        updated = { ...normalized.fixture, revision: current.revision + 1 };
        await tx
          .insertInto('fixture_observations')
          .values({
            fixture_id: fixtureId,
            revision: updated.revision,
            evidence_id: evidenceId,
            payload: { ...normalized, fixture: updated },
          })
          .execute();
        for (const performance of normalized.performances) {
          const latest = await tx
            .selectFrom('fact_revisions')
            .select('revision')
            .where('fixture_id', '=', fixtureId)
            .where('footballer_id', '=', performance.footballerId)
            .orderBy('revision', 'desc')
            .executeTakeFirst();
          await tx
            .insertInto('fact_revisions')
            .values({
              id: randomUUID(),
              fixture_id: fixtureId,
              footballer_id: performance.footballerId,
              revision: (latest?.revision ?? 0) + 1,
              evidence_id: evidenceId,
              is_override: false,
              actor_id: principal.accountId,
              reason: command.reason,
              payload: {
                kind: 'performance',
                statistics: performance.statistics,
                discipline: performance.discipline,
              },
            })
            .execute();
        }
        await tx
          .updateTable('fixtures')
          .set({ data: updated, kickoff: updated.kickoff })
          .where('id', '=', fixtureId)
          .execute();
      }
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
        !observation?.payload.eligibleFootballerIds.includes(
          command.footballerId,
        )
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
            : {
                source: command.source,
                normalizationFingerprint: normalization?.fingerprint ?? null,
              }),
        },
      })
      .execute();
    return updated;
  });
}

/** PostgreSQL JSON object order and source array order must not create a new football observation. */
function canonicalObservation(
  observation: FixtureObservation,
  revision: number,
): FixtureObservation {
  return fixtureObservationSchema.parse({
    ...observation,
    fixture: { ...observation.fixture, revision },
    eligibleFootballerIds: [...observation.eligibleFootballerIds].sort(),
    performances: [...observation.performances].sort((a, b) =>
      a.footballerId.localeCompare(b.footballerId),
    ),
  });
}
