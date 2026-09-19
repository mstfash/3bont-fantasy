import { requiredFixtureValue } from './required-fixture-value.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  clubSchema,
  footballerSchema,
  seasonSchema,
  providerAccountSchema,
  providerCollectionSchema,
  providerAcceptanceCommandSchema,
  AUTOMATIC_PROVIDER_ADAPTER,
} from '@fantasy/contracts';
import { providerTimelineFixture } from './provider-timeline-fixture.ts';
import { executeProviderScheduleCommand } from '../src/provider-schedules.ts';
import { grantProofStaff } from './proof-staff.ts';
export async function acceptanceFixture(
  db: ReturnType<typeof createDatabase>,
  leagueId = 990040,
) {
  const f = providerTimelineFixture();
  f.binding.leagueId = leagueId;
  f.sources.fixtures.request = {
    resource: 'fixtures',
    league: leagueId,
    season: 2026,
  };
  f.sources.fixtures.payload.parameters = {
    league: String(leagueId),
    season: '2026',
  };
  requiredFixtureValue(f.sources.fixtures.payload.response[0]).league.id =
    leagueId;
  const home = requiredFixtureValue(f.sources.players.payload.response[0]);
  const bench = structuredClone(requiredFixtureValue(home.players[0]));
  bench.player.id = 8002;
  requiredFixtureValue(bench.statistics[0]).games.minutes = 0;
  requiredFixtureValue(bench.statistics[0]).goals.total = 0;
  requiredFixtureValue(bench.statistics[0]).penalty.missed = 0;
  home.players.push(bench);
  const now = requiredFixtureValue(
    (
      await sql<{
        now: Date;
      }>`SELECT clock_timestamp() - interval '1 second' AS now`.execute(db)
    ).rows[0],
  ).now;
  const principal = {
    accountId: `acceptance-${randomUUID()}`,
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: now,
    mfaVerifiedAt: now,
  };
  const grants = [{ role: 'owner' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const season = seasonSchema.parse({
    id: f.fixture.seasonId,
    name: { ar: 'اختبار القبول', en: 'Synthetic acceptance' },
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    synthetic: true,
  });
  await db
    .insertInto('seasons')
    .values({ id: season.id, data: season })
    .execute();
  for (const [index, id] of [
    f.fixture.homeClubId,
    f.fixture.awayClubId,
  ].entries()) {
    const data = clubSchema.parse({
      id,
      seasonId: season.id,
      name: { ar: 'نادي اختبار', en: `Acceptance ${String(index)}` },
      shortName: `A${String(index)}`,
      color: '#123456',
    });
    await db
      .insertInto('clubs')
      .values({ id, season_id: season.id, data })
      .execute();
  }
  for (const [external, id] of f.identities) {
    const data = footballerSchema.parse({
      id,
      seasonId: season.id,
      clubId:
        external === 8003 || external >= 8014
          ? f.fixture.awayClubId
          : f.fixture.homeClubId,
      name: { ar: 'لاعب اختبار', en: `Acceptance player ${String(external)}` },
      defaultPosition: [8004, 8014].includes(external) ? 'GK' : 'DEF',
      status: 'available',
      valuation: null,
      synthetic: true,
    });
    await db
      .insertInto('footballers')
      .values({ id, season_id: season.id, club_id: data.clubId, data })
      .execute();
  }
  await db
    .insertInto('fixtures')
    .values({
      id: f.fixture.id,
      season_id: season.id,
      kickoff: f.fixture.kickoff,
      data: f.fixture,
    })
    .execute();
  const previousAccount = await db
    .selectFrom('provider_accounts')
    .selectAll()
    .executeTakeFirst();
  const account = providerAccountSchema.parse({
    id: previousAccount?.id ?? randomUUID(),
    provider: 'api-football-direct',
    revision: previousAccount?.revision ?? 1,
    state: 'enabled',
    dailyLimit: 100,
    minuteLimit: 10,
    resetAnchor: now.toISOString(),
    evidenceReference: 'Synthetic policy fixture; no HTTP',
    dedicatedKeyConfirmed: true,
    reconciledAt: now.toISOString(),
  });
  await db
    .insertInto('provider_accounts')
    .values({
      id: account.id,
      provider: account.provider,
      revision: account.revision,
      data: account,
    })
    .onConflict((oc) => oc.column('id').doUpdateSet({ data: account }))
    .execute();
  await db
    .insertInto('provider_quota_windows')
    .values({
      account_id: account.id,
      starts_at: now,
      ends_at: new Date(now.getTime() + 86400000),
      ceiling: 100,
      ordinary_ceiling: 90,
      used: 4,
      ordinary_used: 4,
    })
    .execute();
  await db
    .insertInto('provider_evidence')
    .values({
      id: f.binding.evidenceId,
      provider: 'api-football-direct',
      resource: 'synthetic-policy-evidence',
      checksum: createHash('sha256').update('synthetic').digest('hex'),
      payload: { synthetic: true },
    })
    .execute();
  await db
    .insertInto('provider_season_bindings')
    .values({
      id: f.binding.id,
      provider: f.binding.provider,
      season_id: season.id,
      league_id: String(leagueId),
      season_year: 2026,
      evidence_id: f.binding.evidenceId,
      data: f.binding,
    })
    .execute();
  for (const m of f.mappings) {
    await db
      .insertInto('provider_identities')
      .values({
        id: m.id,
        binding_id: m.bindingId,
        kind: m.kind,
        external_id: String(m.externalId),
        entity_id: m.entityId,
        revision: m.revision,
        data: m,
      })
      .execute();
    await db
      .insertInto('provider_identity_history')
      .values({
        mapping_id: m.id,
        revision: m.revision,
        evidence_id: m.evidenceId,
        data: m,
      })
      .execute();
  }
  const schedule = await executeProviderScheduleCommand(db, principal, grants, {
    commandId: randomUUID(),
    accountId: account.id,
    bindingId: f.binding.id,
    expectedRevision: 0,
    enabled: true,
    liveIntervalMinutes: 60,
    correctionIntervalMinutes: 120,
    beforeKickoffMinutes: 30,
    activeHours: 3,
    correctionHours: 24,
    evidenceReference: 'Synthetic coverage only; no HTTP',
    reason: 'Exercise cached provider acceptance',
  });
  const policyCommand = (expectedRevision = 0, enabled = true) =>
    providerAcceptanceCommandSchema.parse({
      commandId: randomUUID(),
      accountId: account.id,
      bindingId: f.binding.id,
      expectedRevision,
      enabled,
      adapterVersion: AUTOMATIC_PROVIDER_ADAPTER,
      maximumSourceAgeMinutes: 120,
      eligibilityEvidenceReference:
        'Synthetic full team sheet and explicit bench statistics',
      completeEligibilityConfirmed: enabled,
      reason: 'Exercise reviewed synthetic acceptance policy',
    });
  async function batch(sources = f.sources, ageMinutes = 0, spreadMinutes = 0) {
    const at = requiredFixtureValue(
      (
        await sql<{
          now: Date;
        }>`SELECT clock_timestamp() AS now`.execute(db)
      ).rows[0],
    ).now;
    const mapping = requiredFixtureValue(
      f.mappings.find((m) => m.kind === 'fixture'),
    );
    const data = providerCollectionSchema.parse({
      id: randomUUID(),
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      fixtureId: f.fixture.id,
      fixtureKickoff: f.fixture.kickoff,
      mappingId: mapping.id,
      mappingRevision: mapping.revision,
      requests: Object.values(sources).map((s) => s.request),
      state: 'complete',
      step: 4,
      plannedAt: at.toISOString(),
      startedAt: at.toISOString(),
      finishedAt: at.toISOString(),
      code: null,
    });
    await db
      .insertInto('provider_collection_batches')
      .values({
        id: data.id,
        schedule_id: schedule.id,
        fixture_id: f.fixture.id,
        mapping_id: mapping.id,
        mapping_revision: mapping.revision,
        state: data.state,
        planned_at: at,
        next_attempt_at: at,
        claim_id: null,
        claimed_until: null,
        data,
      })
      .execute();
    const ids: string[] = [];
    for (const [step, source] of Object.values(sources).entries()) {
      const id = randomUUID(),
        evidenceId = randomUUID();
      const checksum = createHash('sha256')
        .update(JSON.stringify(source.payload))
        .digest('hex');
      const finished = new Date(
        at.getTime() -
          ageMinutes * 60000 -
          ((3 - step) * spreadMinutes * 60000) / 3,
      );
      await db
        .insertInto('provider_evidence')
        .values({
          id: evidenceId,
          provider: 'api-football-direct',
          resource: source.request.resource,
          checksum,
          payload: source.payload,
        })
        .execute();
      await db
        .insertInto('provider_attempts')
        .values({
          id,
          account_id: account.id,
          window_start: now,
          request: source.request,
          request_fingerprint: checksum,
          priority: 'ordinary',
          reserved_at: finished,
          dispatch_expires_at: new Date(finished.getTime() + 5000),
          finished_at: finished,
          outcome: 'success',
          http_status: 200,
          response_checksum: checksum,
          evidence_id: evidenceId,
        })
        .execute();
      await db
        .insertInto('provider_collection_attempts')
        .values({ batch_id: data.id, step, attempt_id: id })
        .execute();
      ids.push(id);
    }
    return { ...data, attemptIds: ids };
  }
  async function restore() {
    await sql`UPDATE fantasy.provider_acceptance_policies SET data=jsonb_set(data,'{enabled}','false') WHERE binding_id=${f.binding.id}`.execute(
      db,
    );
    await sql`UPDATE fantasy.provider_schedules SET data=jsonb_set(data,'{enabled}','false') WHERE id=${schedule.id}`.execute(
      db,
    );
    if (previousAccount)
      await db
        .updateTable('provider_accounts')
        .set({ data: previousAccount.data, revision: previousAccount.revision })
        .where('id', '=', account.id)
        .execute();
    else
      await db
        .updateTable('provider_accounts')
        .set({ data: { ...account, state: 'paused' } })
        .where('id', '=', account.id)
        .execute();
  }
  return {
    ...f,
    principal,
    grants,
    account,
    schedule,
    policyCommand,
    batch,
    restore,
    windowStart: now,
  };
}
