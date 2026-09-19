import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  clubSchema,
  footballerSchema,
  seasonSchema,
  providerNormalizationSelectionSchema,
  type MatchDataCommand,
  type ProviderNormalizationPreview,
} from '@fantasy/contracts';
import { normalizationFixture } from './provider-normalization-fixture.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import { previewProviderNormalization } from '../src/provider-normalization.ts';
import { executeMatchDataCommand } from '../src/match-data.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 6 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const reject = (code: string) => (e: unknown) =>
  e instanceof CommandRejected && e.code === code;
void test('reviewed provider drafts retain evidence/mapping history, reject stale reviews, preserve overrides and deduplicate observations', async () => {
  const f = normalizationFixture();
  const principal = {
    accountId: `normalization-${randomUUID()}`,
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const season = seasonSchema.parse({
    id: f.fixture.seasonId,
    name: { ar: 'اختبار الاستيراد', en: 'Synthetic normalization' },
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    synthetic: true,
  });
  await db
    .insertInto('seasons')
    .values({ id: season.id, data: season })
    .execute();
  for (const [i, id] of [
    f.fixture.homeClubId,
    f.fixture.awayClubId,
  ].entries()) {
    const data = clubSchema.parse({
      id,
      seasonId: season.id,
      name: { ar: 'نادي اختبار', en: `Synthetic ${String(i)}` },
      shortName: `N${String(i)}`,
      color: '#123456',
    });
    await db
      .insertInto('clubs')
      .values({ id, season_id: season.id, data })
      .execute();
  }
  for (const [i, id] of f.players.entries()) {
    // The home bench player has since transferred. Historical lineup identity remains usable.
    const data = footballerSchema.parse({
      id,
      seasonId: season.id,
      clubId: i === 0 ? f.fixture.homeClubId : f.fixture.awayClubId,
      name: { ar: 'لاعب اختبار', en: `Synthetic player ${String(i)}` },
      defaultPosition: 'MID',
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
  let account = await db
    .selectFrom('provider_accounts')
    .select('id')
    .executeTakeFirst();
  if (!account) {
    const id = randomUUID();
    await db
      .insertInto('provider_accounts')
      .values({
        id,
        provider: 'api-football-direct',
        revision: 1,
        data: {
          id,
          provider: 'api-football-direct',
          revision: 1,
          state: 'paused',
          dailyLimit: null,
          minuteLimit: null,
          resetAnchor: null,
          evidenceReference: null,
          dedicatedKeyConfirmed: false,
          reconciledAt: null,
        },
      })
      .execute();
    account = { id };
  }
  const now = new Date();
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
  const attempts: string[] = [];
  for (const [i, source] of Object.values(f.sources).entries()) {
    const id = randomUUID(),
      evidenceId = i === 0 ? f.binding.evidenceId : randomUUID();
    const checksum = createHash('sha256')
      .update(JSON.stringify(source.payload))
      .digest('hex');
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
        reserved_at: now,
        dispatch_expires_at: new Date(now.getTime() + 5000),
        finished_at: now,
        outcome: 'success',
        http_status: 200,
        response_checksum: checksum,
        evidence_id: evidenceId,
      })
      .execute();
    attempts.push(id);
  }
  await db
    .insertInto('provider_season_bindings')
    .values({
      id: f.binding.id,
      provider: f.binding.provider,
      season_id: season.id,
      league_id: String(f.binding.leagueId),
      season_year: f.binding.seasonYear,
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
        revision: 1,
        data: m,
      })
      .execute();
    await db
      .insertInto('provider_identity_history')
      .values({
        mapping_id: m.id,
        revision: 1,
        evidence_id: m.evidenceId,
        data: m,
      })
      .execute();
  }
  const selection = providerNormalizationSelectionSchema.parse({
    fixtureId: f.fixture.id,
    fixtureAttemptId: attempts[0],
    playersAttemptId: attempts[1],
    lineupsAttemptId: attempts[2],
    eventsAttemptId: attempts[3],
  });
  const preview = await previewProviderNormalization(
    db,
    principal,
    grants,
    selection,
  );
  assert.equal(preview.observation.performances.length, 3);
  assert.equal(preview.observation.eligibilityComplete, false);
  assert.equal(
    (
      await db
        .selectFrom('fixture_observations')
        .select('revision')
        .where('fixture_id', '=', f.fixture.id)
        .execute()
    ).length,
    0,
  );
  const command = (p: ProviderNormalizationPreview): MatchDataCommand => ({
    kind: 'import',
    commandId: randomUUID(),
    expectedRevision: p.observation.fixture.revision,
    source: 'api-football-reviewed',
    observation: p.observation,
    reason: 'Reviewed synthetic provider draft; missing facts remain unknown',
    providerReview: {
      selection,
      expectedFingerprint: p.fingerprint,
      eligibilityReference:
        'Synthetic lineup reviewed; historical eligibility not yet complete',
    },
  });
  const mapped = f.mappings[0];
  assert.ok(mapped);
  const changed = { ...mapped, revision: 2 };
  await db
    .updateTable('provider_identities')
    .set({ revision: 2, data: changed })
    .where('id', '=', mapped.id)
    .execute();
  await db
    .insertInto('provider_identity_history')
    .values({
      mapping_id: mapped.id,
      revision: 2,
      evidence_id: mapped.evidenceId,
      data: changed,
    })
    .execute();
  await assert.rejects(
    executeMatchDataCommand(db, principal, grants, command(preview)),
    reject('normalization-preview-changed'),
  );
  const fresh = await previewProviderNormalization(
      db,
      principal,
      grants,
      selection,
    ),
    commit = command(fresh);
  const results = await Promise.all([
    executeMatchDataCommand(db, principal, grants, commit),
    executeMatchDataCommand(db, principal, grants, commit),
  ]);
  assert.equal(results[0].revision, 2);
  assert.deepEqual(results[0], results[1]);
  assert.equal(
    (
      await db
        .selectFrom('provider_normalization_sources')
        .selectAll()
        .where('attempt_id', '=', selection.fixtureAttemptId)
        .execute()
    ).length,
    1,
  );
  await assert.rejects(
    db
      .deleteFrom('provider_attempts')
      .where('id', '=', selection.fixtureAttemptId)
      .execute(),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === '23503',
  );
  await assert.rejects(
    db
      .deleteFrom('provider_identity_history')
      .where('mapping_id', '=', mapped.id)
      .where('revision', '=', 2)
      .execute(),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === '23503',
  );
  const repeated = await previewProviderNormalization(
    db,
    principal,
    grants,
    selection,
  );
  assert.equal(
    (await executeMatchDataCommand(db, principal, grants, command(repeated)))
      .revision,
    2,
  );
  const performance = repeated.observation.performances[0];
  assert.ok(performance);
  await executeMatchDataCommand(db, principal, grants, {
    kind: 'override',
    commandId: randomUUID(),
    fixtureId: f.fixture.id,
    footballerId: performance.footballerId,
    expectedRevision: 1,
    reason: 'Persistent synthetic factual correction',
    change: {
      kind: 'performance',
      statistics: { ...performance.statistics, goals: 2 },
      discipline: null,
    },
  });
  const afterOverride = await previewProviderNormalization(
    db,
    principal,
    grants,
    selection,
  );
  await executeMatchDataCommand(db, principal, grants, command(afterOverride));
  const overrides = await db
    .selectFrom('fact_revisions')
    .select('payload')
    .where('fixture_id', '=', f.fixture.id)
    .where('is_override', '=', true)
    .execute();
  assert.equal(overrides.length, 1);
  const reports = await db
    .selectFrom('fixture_observations')
    .selectAll()
    .where('fixture_id', '=', f.fixture.id)
    .execute();
  assert.equal(
    reports.length,
    1,
    'unchanged source observations do not restart correction windows',
  );
  await db
    .updateTable('provider_attempts')
    .set({ finished_at: new Date(now.getTime() + 11 * 60000) })
    .where('id', '=', selection.eventsAttemptId)
    .execute();
  await assert.rejects(
    previewProviderNormalization(db, principal, grants, selection),
    reject('normalization-source-window'),
  );
  await db
    .deleteFrom('staff_grants')
    .where('account_id', '=', principal.accountId)
    .execute();
  await assert.rejects(
    executeMatchDataCommand(db, principal, grants, commit),
    AccessDenied,
  );
});
