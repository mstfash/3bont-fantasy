import { createHash, randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  fixtureObservationSchema,
  type Fixture,
  type FixtureObservation,
  type ProviderNormalizationPreview,
} from '@fantasy/contracts';
import { latestFixtureDisposition } from './fixture-dispositions.ts';
import { CommandRejected } from './errors.ts';
type Provenance =
  | {
      kind: 'reviewed-provider-report';
      normalization: ProviderNormalizationPreview;
      eligibilityReference: string;
    }
  | {
      kind: 'automatic-provider-report';
      normalization: ProviderNormalizationPreview;
      eligibilityReference: string;
      policy: { bindingId: string; revision: number; adapterVersion: string };
    };
/** Caller holds the fixture lock and has authorized either the staff command or a current provider policy. */
export async function applyFixtureObservation(
  tx: Transaction<Database>,
  actorId: string,
  current: Fixture,
  {
    observation,
    expectedRevision,
    source,
    reason,
  }: {
    observation: FixtureObservation;
    expectedRevision: number;
    source: string;
    reason: string;
  },
  provenance: Provenance | null,
) {
  const fixtureId = current.id;
  const normalization = provenance?.normalization ?? null;
  let updated = current;
  const disposition = await latestFixtureDisposition(tx, fixtureId);
  if (disposition && disposition.choice.outcome !== 'release')
    throw new CommandRejected('fixture-disposition-active');
  if (['void', 'awarded'].includes(observation.fixture.status))
    throw new CommandRejected('fixture-disposition-required');
  if (current.revision !== expectedRevision)
    throw new CommandRejected('fixture-changed');
  const incoming = observation;
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
  if (incoming.eligibilityComplete && eligible.length === 0)
    throw new CommandRejected('empty-eligibility-roster');
  const last = await tx
    .selectFrom('fixture_observations')
    .select('payload')
    .where('fixture_id', '=', fixtureId)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  const evidencePayload = provenance
    ? { ...provenance, observation: incoming }
    : incoming;
  const evidenceId = randomUUID();
  await tx
    .insertInto('provider_evidence')
    .values({
      id: evidenceId,
      provider: source,
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
  if (
    JSON.stringify(normalized) !== JSON.stringify(previous) ||
    JSON.stringify(normalized.fixture) !== JSON.stringify(current)
  ) {
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
          actor_id: actorId,
          reason: reason,
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
  return { fixture: updated, evidenceId };
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
