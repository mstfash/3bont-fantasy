import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  clubSchema,
  fixtureSchema,
  seasonSchema,
  type ProviderIdentityCommand,
  type ProviderRequest,
} from '@fantasy/contracts';
import { executeProviderIdentityCommand } from '../src/provider-identities.ts';
import { readProviderIdentityAdministration } from '../src/provider-identity-query.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
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
void test('provider identity bindings require successful evidence, preserve mapping history and reject scope, revision and fixture conflicts', async () => {
  const actorId = `identity-proof-${randomUUID()}`;
  const principal = {
    accountId: actorId,
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, actorId, grants);
  const run = (command: ProviderIdentityCommand) =>
    executeProviderIdentityCommand(db, principal, grants, command);
  const season = seasonSchema.parse({
    id: randomUUID(),
    name: { ar: 'دوري اختبار', en: 'Synthetic identity league' },
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    synthetic: true,
  });
  await db
    .insertInto('seasons')
    .values({ id: season.id, data: season })
    .execute();
  const clubs = [0, 1, 2].map((n) =>
    clubSchema.parse({
      id: randomUUID(),
      seasonId: season.id,
      name: { ar: `نادي ${String(n)}`, en: `Club ${String(n)}` },
      shortName: `C${String(n)}`,
      color: '#123456',
    }),
  );
  for (const club of clubs)
    await db
      .insertInto('clubs')
      .values({ id: club.id, season_id: season.id, data: club })
      .execute();
  const home = clubs[0],
    away = clubs[1],
    replacement = clubs[2];
  assert.ok(home && away && replacement);
  const fixture = fixtureSchema.parse({
    id: randomUUID(),
    seasonId: season.id,
    homeClubId: home.id,
    awayClubId: away.id,
    kickoff: '2026-11-01T12:00:00Z',
    status: 'scheduled',
    homeGoals: null,
    awayGoals: null,
    factsComplete: false,
    revision: 1,
  });
  await db
    .insertInto('fixtures')
    .values({
      id: fixture.id,
      season_id: season.id,
      kickoff: new Date(fixture.kickoff),
      data: fixture,
    })
    .execute();
  // Synthetic persisted transport outcomes; this test performs no outbound requests.
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
  const starts = new Date('2020-01-01T00:00:00Z');
  await db
    .insertInto('provider_quota_windows')
    .values({
      account_id: account.id,
      starts_at: starts,
      ends_at: new Date('2020-01-02T00:00:00Z'),
      ceiling: 100,
      ordinary_ceiling: 90,
      used: 10,
      ordinary_used: 10,
    })
    .execute();
  const proof = async (
    request: ProviderRequest,
    response: unknown[],
    success = true,
  ) => {
    const id = randomUUID(),
      payload = {
        get: request.resource,
        errors: [],
        results: response.length,
        paging: { current: 1, total: 1 },
        response,
      };
    const checksum = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    await db
      .insertInto('provider_evidence')
      .values({
        id,
        provider: 'api-football-direct',
        resource: request.resource,
        checksum,
        payload,
      })
      .execute();
    await db
      .insertInto('provider_attempts')
      .values({
        id: randomUUID(),
        account_id: account.id,
        window_start: starts,
        request,
        request_fingerprint: checksum,
        priority: 'ordinary',
        reserved_at: starts,
        dispatch_expires_at: new Date(starts.getTime() + 5000),
        finished_at: starts,
        outcome: success ? 'success' : 'provider-error',
        http_status: success ? 200 : 500,
        response_checksum: checksum,
        evidence_id: id,
      })
      .execute();
    return id;
  };
  const leagueId = 900001;
  const discovery = [
    {
      league: { id: leagueId, name: 'Synthetic league' },
      country: { name: 'Egypt' },
      seasons: [{ year: 2026 }],
    },
  ];
  const leagueProof = await proof(
    { resource: 'leagues', country: 'Egypt', season: 2026 },
    discovery,
  );
  const failedProof = await proof(
    { resource: 'leagues', country: 'Egypt', season: 2026 },
    discovery,
    false,
  );
  const bind: ProviderIdentityCommand = {
    kind: 'bind-season',
    commandId: randomUUID(),
    reason: 'Bind synthetic source for identity proof',
    evidenceId: leagueProof,
    seasonId: season.id,
    leagueId,
    seasonYear: 2026,
    rightsReference: 'Synthetic fixtures, no licensed external data',
  };
  await assert.rejects(
    run({ ...bind, evidenceId: failedProof }),
    reject('provider-identity-evidence-unavailable'),
  );
  await assert.rejects(
    run({ ...bind, seasonYear: 2027 }),
    reject('provider-identity-scope-mismatch'),
  );
  const [a, b] = await Promise.all([run(bind), run(bind)]);
  assert.deepEqual(a, b);
  await assert.rejects(
    run({ ...bind, commandId: randomUUID() }),
    reject('provider-season-already-bound'),
  );
  const teamsProof = await proof(
    { resource: 'teams', league: leagueId, season: 2026 },
    [1, 2, 3].map((id) => ({ team: { id, name: 'Same display name' } })),
  );
  const map = (
    externalId: number,
    entityId: string,
    expectedRevision = 0,
  ): Extract<ProviderIdentityCommand, { kind: 'map-entity' }> => ({
    kind: 'map-entity',
    commandId: randomUUID(),
    reason: 'Reviewed synthetic identity link',
    evidenceId: teamsProof,
    bindingId: a.binding.id,
    entityKind: 'club',
    externalId,
    entityId,
    expectedRevision,
    targetChangeReviewed: false,
  });
  const first = await run(map(1, home.id));
  assert.ok(first.mapping);
  await assert.rejects(
    run(map(3, home.id)),
    reject('provider-identity-target-conflict'),
  );
  await assert.rejects(
    run(map(1, replacement.id, 1)),
    reject('provider-identity-relink-review-required'),
  );
  await assert.rejects(
    run(map(1, home.id)),
    reject('provider-identity-changed'),
  );
  await assert.rejects(
    run(map(99, away.id)),
    reject('provider-identity-source-missing'),
  );
  await assert.rejects(
    run(map(2, randomUUID())),
    reject('provider-identity-target-unavailable'),
  );
  await run(map(2, away.id));
  const fixtureProof = await proof(
    { resource: 'fixtures', league: leagueId, season: 2026 },
    [
      {
        fixture: { id: 51 },
        league: { id: leagueId, season: 2026 },
        teams: { home: { id: 1, name: 'Home' }, away: { id: 2, name: 'Away' } },
      },
    ],
  );
  const fixtureCommand: ProviderIdentityCommand = {
    ...map(51, fixture.id),
    evidenceId: fixtureProof,
    entityKind: 'fixture',
  };
  const fixtureMapping = await run(fixtureCommand);
  assert.ok(fixtureMapping.mapping);
  const retire: ProviderIdentityCommand = {
    kind: 'retire-entity',
    commandId: randomUUID(),
    mappingId: first.mapping.id,
    expectedRevision: 1,
    reason: 'Retire incorrect synthetic identity',
  };
  await assert.rejects(run(retire), reject('provider-identity-has-fixtures'));
  await run({
    ...retire,
    commandId: randomUUID(),
    mappingId: fixtureMapping.mapping.id,
  });
  await run(retire);
  const other = await run(map(3, home.id));
  assert.ok(other.mapping);
  await assert.rejects(
    run({ ...fixtureCommand, commandId: randomUUID(), expectedRevision: 2 }),
    reject('provider-fixture-clubs-mismatch'),
  );
  await run({
    ...retire,
    commandId: randomUUID(),
    mappingId: other.mapping.id,
  });
  const restored = await run(map(1, home.id, 2));
  assert.equal(restored.mapping?.revision, 3);
  const history = await db
    .selectFrom('provider_identity_history')
    .select('data')
    .where('mapping_id', '=', first.mapping.id)
    .orderBy('revision')
    .execute();
  assert.deepEqual(
    history.map((r) => r.data.state),
    ['active', 'retired', 'active'],
  );
  assert.ok(history.every((r) => r.data.evidenceId === teamsProof));
  const relinked = await run({
    ...map(1, replacement.id, 3),
    targetChangeReviewed: true,
  });
  assert.equal(relinked.mapping?.entityId, replacement.id);
  assert.equal(relinked.mapping.revision, 4);
  const query = await readProviderIdentityAdministration(
    db,
    principal,
    grants,
    { bindingId: a.binding.id, evidenceId: teamsProof, kind: 'club' },
  );
  assert.equal(query.candidates.length, 3);
  assert.equal(query.mappings.length, 3);
  await assert.rejects(
    executeProviderIdentityCommand(
      db,
      principal,
      [{ role: 'data-steward', competitionId: randomUUID() }],
      map(3, replacement.id, 2),
    ),
    AccessDenied,
  );
  await clearProofStaff(db);
  await assert.rejects(run(bind), AccessDenied);
});
