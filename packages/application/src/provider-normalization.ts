import { z } from 'zod';
import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  fixtureSchema,
  providerNormalizationSelectionSchema,
  providerNormalizationPreviewSchema,
  type ProviderNormalizationSelection,
} from '@fantasy/contracts';
import { parseProviderMatch } from './provider-match-parser.ts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { CommandRejected } from './errors.ts';

/** Acquire after staff/command barriers, before fixture locks; retain until the reviewed report commits. */
export async function loadProviderNormalization(
  tx: Transaction<Database>,
  input: ProviderNormalizationSelection,
) {
  const selection = providerNormalizationSelectionSchema.parse(input);
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'catalogue-import-coordination'},0))`.execute(
    tx,
  );
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'provider-identity-mapping'},0))`.execute(
    tx,
  );
  const row = await tx
    .selectFrom('fixtures')
    .select('data')
    .where('id', '=', selection.fixtureId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new CommandRejected('fixture-unavailable');
  const fixture = fixtureSchema.parse(row.data);
  const binding = (
    await tx
      .selectFrom('provider_season_bindings')
      .select('data')
      .where('season_id', '=', fixture.seasonId)
      .executeTakeFirst()
  )?.data;
  if (!binding) throw new CommandRejected('normalization-binding-missing');
  const mappings = (
    await tx
      .selectFrom('provider_identities')
      .select('data')
      .where('binding_id', '=', binding.id)
      .limit(10001)
      .execute()
  ).map((r) => r.data);
  if (mappings.length > 10000)
    throw new CommandRejected('normalization-scope-too-large');
  const ids = [
    selection.fixtureAttemptId,
    selection.playersAttemptId,
    selection.lineupsAttemptId,
    selection.eventsAttemptId,
  ];
  if (new Set(ids).size !== 4)
    throw new CommandRejected('normalization-source-invalid');
  const rows = await tx
    .selectFrom('provider_attempts')
    .innerJoin(
      'provider_accounts',
      'provider_accounts.id',
      'provider_attempts.account_id',
    )
    .innerJoin(
      'provider_evidence',
      'provider_evidence.id',
      'provider_attempts.evidence_id',
    )
    .select([
      'provider_attempts.id',
      'provider_attempts.account_id',
      'provider_attempts.request',
      'provider_attempts.finished_at',
      'provider_evidence.id as evidenceId',
      'provider_evidence.checksum',
      'provider_evidence.payload',
    ])
    .where('provider_attempts.id', 'in', ids)
    .where('provider_attempts.outcome', '=', 'success')
    .where('provider_attempts.http_status', '=', 200)
    .where('provider_evidence.provider', '=', 'api-football-direct')
    .where('provider_accounts.provider', '=', 'api-football-direct')
    .execute();
  if (rows.length !== 4 || new Set(rows.map((r) => r.account_id)).size !== 1)
    throw new CommandRejected('normalization-evidence-unavailable');
  const times = rows.map((r) => r.finished_at?.getTime() ?? NaN);
  if (
    times.some((t) => !Number.isFinite(t)) ||
    Math.max(...times) - Math.min(...times) > 10 * 60000
  )
    throw new CommandRejected('normalization-source-window');
  const get = (id: string) => {
    const source = rows.find((r) => r.id === id);
    if (!source)
      throw new CommandRejected('normalization-evidence-unavailable');
    return source;
  };
  const normalized = parseProviderMatch(fixture, binding, mappings, {
    fixtures: get(selection.fixtureAttemptId),
    players: get(selection.playersAttemptId),
    lineups: get(selection.lineupsAttemptId),
    events: get(selection.eventsAttemptId),
  });
  // Same-season existence is checked independently of a player's current club after a transfer.
  const footballers = normalized.observation.eligibleFootballerIds.length
    ? await tx
        .selectFrom('footballers')
        .select('id')
        .where('season_id', '=', fixture.seasonId)
        .where('id', 'in', normalized.observation.eligibleFootballerIds)
        .execute()
    : [];
  if (
    footballers.length !== normalized.observation.eligibleFootballerIds.length
  )
    throw new CommandRejected('footballer-outside-season');
  const last = await tx
    .selectFrom('fixture_observations')
    .select('payload')
    .where('fixture_id', '=', fixture.id)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  const basis = {
    selection,
    adapterVersion: 'api-football-reviewed-v1',
    ...normalized,
    binding,
    sources: ids.map((id) => {
      const r = get(id);
      return {
        attemptId: r.id,
        evidenceId: r.evidenceId,
        checksum: r.checksum,
      };
    }),
    replacesCompleteReport:
      fixture.factsComplete || !!last?.payload.eligibilityComplete,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(basis))
    .digest('hex');
  return providerNormalizationPreviewSchema.parse({ ...basis, fingerprint });
}

export async function previewProviderNormalization(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  selection: ProviderNormalizationSelection,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
    return loadProviderNormalization(tx, selection);
  });
}

export async function readNormalizationSources(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  fixtureId: string,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  const fixture = (
    await db
      .selectFrom('fixtures')
      .select('data')
      .where('id', '=', fixtureId)
      .executeTakeFirst()
  )?.data;
  if (!fixture) return null;
  const binding = (
    await db
      .selectFrom('provider_season_bindings')
      .select('data')
      .where('season_id', '=', fixture.seasonId)
      .executeTakeFirst()
  )?.data;
  if (!binding) return null;
  const mapping = (
    await db
      .selectFrom('provider_identities')
      .select('data')
      .where('binding_id', '=', binding.id)
      .where('kind', '=', 'fixture')
      .where('entity_id', '=', fixtureId)
      .where(sql<string>`data->>'state'`, '=', 'active')
      .executeTakeFirst()
  )?.data;
  if (!mapping) return null;
  const query = db
    .selectFrom('provider_attempts')
    .select(['id', 'request', 'finished_at'])
    .where('outcome', '=', 'success')
    .where('http_status', '=', 200)
    .where('evidence_id', 'is not', null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb(sql<string>`request->>'resource'`, '=', 'fixtures'),
          eb(sql<string>`request->>'league'`, '=', String(binding.leagueId)),
          eb(sql<string>`request->>'season'`, '=', String(binding.seasonYear)),
        ]),
        eb.and([
          eb(sql<string>`request->>'resource'`, 'in', [
            'fixtures/players',
            'fixtures/lineups',
            'fixtures/events',
          ]),
          eb(sql<string>`request->>'fixture'`, '=', String(mapping.externalId)),
        ]),
      ]),
    )
    .orderBy('finished_at', 'desc');
  const attempts = (
    await Promise.all(
      [
        'fixtures',
        'fixtures/players',
        'fixtures/lineups',
        'fixtures/events',
      ].map((resource) =>
        query
          .where(sql<string>`request->>'resource'`, '=', resource)
          .limit(25)
          .execute(),
      ),
    )
  ).flat();
  return attempts.map((a) => ({
    id: a.id,
    resource: a.request.resource,
    finishedAt: a.finished_at?.toISOString() ?? null,
  }));
}

export async function readSavedProviderReview(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  fixtureId: string,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  const row = await db
    .selectFrom('fixture_observations')
    .innerJoin(
      'provider_evidence',
      'provider_evidence.id',
      'fixture_observations.evidence_id',
    )
    .select('provider_evidence.payload')
    .where('fixture_observations.fixture_id', '=', fixtureId)
    .orderBy('fixture_observations.revision', 'desc')
    .executeTakeFirst();
  const parsed = z
    .object({
      kind: z.literal('reviewed-provider-report'),
      eligibilityReference: z.string(),
      normalization: z.object({
        sources: providerNormalizationPreviewSchema.shape.sources,
      }),
    })
    .safeParse(row?.payload);
  return parsed.success
    ? {
        sources: parsed.data.normalization.sources,
        eligibilityReference: parsed.data.eligibilityReference,
      }
    : null;
}
