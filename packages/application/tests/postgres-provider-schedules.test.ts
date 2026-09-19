import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  fixtureSchema,
  gameweekSchema,
  providerAccountSchema,
  providerIdentitySchema,
  providerScheduleCommandSchema,
  providerSeasonBindingSchema,
} from '@fantasy/contracts';
import { seedDemo } from '../src/demo.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import { executeProviderScheduleCommand } from '../src/provider-schedules.ts';
import { planProviderCollections } from '../src/provider-collection-plan.ts';
import { processNextProviderCollection } from '../src/provider-collection-runner.ts';
import {
  providerQuotaWindow,
  reserveProviderAttempt,
} from '../src/provider-quota.ts';
import { fetchProviderResource } from '../src/provider-gateway.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 8 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('fixture collection is bounded, durable, quota-gated and separate from football publication', async (t) => {
  await seedDemo(db);
  const principal = {
    accountId: `collection-${randomUUID()}`,
    sessionId: randomUUID(),
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
  };
  const grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const now = new Date(),
    seasonId = randomUUID(),
    home = randomUUID(),
    away = randomUUID();
  await db
    .insertInto('seasons')
    .values({
      id: seasonId,
      data: {
        id: seasonId,
        name: { ar: 'اختبار الجمع', en: 'Synthetic collection' },
        startsAt: '2026-01-01T00:00:00Z',
        endsAt: '2027-01-01T00:00:00Z',
        synthetic: true,
      },
    })
    .execute();
  for (const [i, id] of [home, away].entries())
    await db
      .insertInto('clubs')
      .values({
        id,
        season_id: seasonId,
        data: {
          id,
          seasonId,
          name: { ar: 'نادي اختبار', en: `Collection ${String(i)}` },
          shortName: `C${String(i)}`,
          color: '#123456',
        },
      })
      .execute();
  const existing = await db
    .selectFrom('provider_accounts')
    .selectAll()
    .executeTakeFirst();
  const accountId = existing?.id ?? randomUUID();
  const account = providerAccountSchema.parse({
    id: accountId,
    provider: 'api-football-direct',
    revision: (existing?.revision ?? 0) + 1,
    state: 'enabled',
    dailyLimit: 1000,
    minuteLimit: 10000,
    resetAnchor: new Date(now.getTime() - 3600_000).toISOString(),
    evidenceReference: 'Synthetic quota proof only',
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
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        revision: account.revision,
        data: account,
        cooldown_until: null,
        inflight_attempt_id: null,
        inflight_until: null,
        next_dispatch_at: null,
        minute_headroom: null,
        minute_headroom_until: null,
        observed_minute_limit: null,
        consecutive_failures: 0,
      }),
    )
    .execute();
  const evidenceId = randomUUID();
  await db
    .insertInto('provider_evidence')
    .values({
      id: evidenceId,
      provider: 'api-football-direct',
      resource: 'leagues',
      checksum: 'a'.repeat(64),
      payload: { synthetic: true },
    })
    .execute();
  const binding = providerSeasonBindingSchema.parse({
    id: randomUUID(),
    provider: 'api-football-direct',
    seasonId,
    leagueId: 900030,
    seasonYear: 2026,
    evidenceId,
    rightsReference: 'Synthetic rights reference',
    createdAt: now.toISOString(),
  });
  await db
    .insertInto('provider_season_bindings')
    .values({
      id: binding.id,
      provider: binding.provider,
      season_id: seasonId,
      league_id: String(binding.leagueId),
      season_year: binding.seasonYear,
      evidence_id: evidenceId,
      data: binding,
    })
    .execute();
  const template = competitionSchema.parse(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('slug', '=', 'cairo-demo')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const rounds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const competition = competitionSchema.parse({
      ...template,
      id: randomUUID(),
      slug: `collection-${randomUUID()}`,
      seasonId,
      status: 'published',
    });
    await db
      .insertInto('competitions')
      .values({
        id: competition.id,
        season_id: seasonId,
        slug: competition.slug,
        revision: competition.revision,
        data: competition,
      })
      .execute();
    const round = gameweekSchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      number: 1,
      name: { ar: 'جولة اختبار', en: 'Collection proof' },
      deadline: now.toISOString(),
      status: 'locked',
      rules: competition.rules,
      resultRevision: 0,
      lastMaterialChangeAt: null,
      finalizedAt: null,
      issues: [],
    });
    await db
      .insertInto('gameweeks')
      .values({
        id: round.id,
        competition_id: competition.id,
        number: 1,
        deadline: round.deadline,
        data: round,
      })
      .execute();
    rounds.push(round.id);
  }
  const command = providerScheduleCommandSchema.parse({
    commandId: randomUUID(),
    accountId,
    bindingId: binding.id,
    expectedRevision: 0,
    enabled: true,
    liveIntervalMinutes: 15,
    correctionIntervalMinutes: 360,
    beforeKickoffMinutes: 60,
    activeHours: 8,
    correctionHours: 72,
    evidenceReference: 'Synthetic coverage fixture; no live provider',
    reason: 'Exercise reviewed provider schedule',
  });
  let schedule = await executeProviderScheduleCommand(
    db,
    principal,
    grants,
    command,
  );
  let serial = 0,
    calls = 0;
  const transport: typeof fetch = (input) => {
    calls++;
    const url = new URL(input instanceof Request ? input.url : input);
    return Promise.resolve(
      Response.json({
        get: url.pathname.slice(1),
        parameters: Object.fromEntries(url.searchParams),
        errors: [],
        results: 0,
        paging: { current: 1, total: 1 },
        response: [],
      }),
    );
  };
  async function resetPacing() {
    // Isolated synthetic transport: advance past dispatch/backoff delays without changing quota usage.
    await db
      .updateTable('provider_accounts')
      .set({
        cooldown_until: null,
        inflight_until: null,
        next_dispatch_at: null,
        minute_headroom: null,
        minute_headroom_until: null,
      })
      .where('id', '=', accountId)
      .execute();
    await db
      .updateTable('provider_collection_batches')
      .set({ next_attempt_at: new Date(0) })
      .where('schedule_id', '=', schedule.id)
      .execute();
  }
  async function nextFixture() {
    // Close the preceding synthetic scope so each scenario gets one due fixture.
    const previous = await db
      .selectFrom('fixtures')
      .select('data')
      .where('season_id', '=', seasonId)
      .execute();
    for (const row of previous)
      await db
        .updateTable('fixtures')
        .set({ data: { ...row.data, status: 'void' } })
        .where('id', '=', row.data.id)
        .execute();
    const fixture = fixtureSchema.parse({
      id: randomUUID(),
      seasonId,
      homeClubId: home,
      awayClubId: away,
      kickoff: new Date(Date.now() - 3600_000).toISOString(),
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
        season_id: seasonId,
        kickoff: fixture.kickoff,
        data: fixture,
      })
      .execute();
    const mapping = providerIdentitySchema.parse({
      id: randomUUID(),
      bindingId: binding.id,
      kind: 'fixture',
      state: 'active',
      externalId: 9100 + serial++,
      entityId: fixture.id,
      revision: 1,
      evidenceId,
      updatedAt: now.toISOString(),
    });
    await db
      .insertInto('provider_identities')
      .values({
        id: mapping.id,
        binding_id: binding.id,
        kind: 'fixture',
        external_id: String(mapping.externalId),
        entity_id: fixture.id,
        revision: 1,
        data: mapping,
      })
      .execute();
    await db
      .insertInto('provider_identity_history')
      .values({
        mapping_id: mapping.id,
        revision: 1,
        evidence_id: evidenceId,
        data: mapping,
      })
      .execute();
    for (const roundId of rounds) {
      const round = await db
        .selectFrom('gameweeks')
        .select('competition_id')
        .where('id', '=', roundId)
        .executeTakeFirstOrThrow();
      await db
        .insertInto('fixture_assignments')
        .values({
          competition_id: round.competition_id,
          fixture_id: fixture.id,
          gameweek_id: roundId,
        })
        .execute();
    }
    return { fixture, mapping };
  }
  await t.test(
    'reviewed schedule retries and concurrent planners keep one batch for a shared fixture',
    async () => {
      assert.deepEqual(
        await executeProviderScheduleCommand(db, principal, grants, command),
        schedule,
      );
      const { fixture } = await nextFixture();
      const plans = await Promise.all([
        planProviderCollections(db),
        planProviderCollections(db),
      ]);
      assert.equal(
        plans.reduce((sum, p) => sum + p.planned, 0),
        1,
      );
      assert.equal(
        (
          await db
            .selectFrom('provider_collection_batches')
            .select('id')
            .where('fixture_id', '=', fixture.id)
            .execute()
        ).length,
        1,
      );
    },
  );
  await t.test(
    'concurrent workers and recovery adopt persisted successes without duplicate HTTP',
    async () => {
      await resetPacing();
      const results = await Promise.all([
        processNextProviderCollection(
          db,
          'synthetic-collection-key',
          transport,
        ),
        processNextProviderCollection(
          db,
          'synthetic-collection-key',
          transport,
        ),
      ]);
      assert.equal(results.filter((r) => r.attempted).length, 1);
      assert.equal(calls, 1);
      const batch = await db
        .selectFrom('provider_collection_batches')
        .select('data')
        .where('schedule_id', '=', schedule.id)
        .where('state', '=', 'collecting')
        .executeTakeFirstOrThrow();
      const claimId = randomUUID();
      await db
        .updateTable('provider_collection_batches')
        .set({ claim_id: claimId, claimed_until: new Date(Date.now() + 45000) })
        .where('id', '=', batch.data.id)
        .execute();
      await resetPacing();
      const request = batch.data.requests[batch.data.step];
      assert.ok(request);
      await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'synthetic-collection-key',
          collection: { batchId: batch.data.id, claimId },
        },
        transport,
      );
      assert.equal(calls, 2);
      await db
        .updateTable('provider_collection_batches')
        .set({ claimed_until: new Date(0) })
        .where('id', '=', batch.data.id)
        .execute();
      const recovered = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      assert.equal(recovered.attempted, false);
      assert.equal(calls, 2);
      for (let i = 0; i < 2; i++) {
        await resetPacing();
        await processNextProviderCollection(
          db,
          'synthetic-collection-key',
          transport,
        );
      }
      const complete = await db
        .selectFrom('provider_collection_batches')
        .select('data')
        .where('id', '=', batch.data.id)
        .executeTakeFirstOrThrow();
      assert.equal(complete.data.state, 'complete');
      assert.equal(complete.data.step, 4);
      assert.equal(calls, 4);
      const links = await db
        .selectFrom('provider_collection_attempts')
        .select('attempt_id')
        .where('batch_id', '=', batch.data.id)
        .execute();
      assert.equal(links.length, 4);
      await assert.rejects(
        db
          .deleteFrom('provider_attempts')
          .where('id', '=', links[0]?.attempt_id ?? '')
          .execute(),
        { code: '23503' },
      );
      assert.equal(
        (
          await db
            .selectFrom('fixtures')
            .select('data')
            .where('id', '=', batch.data.fixtureId)
            .executeTakeFirstOrThrow()
        ).data.factsComplete,
        false,
      );
      assert.equal(
        (
          await db
            .selectFrom('fixture_observations')
            .select('fixture_id')
            .where('fixture_id', '=', batch.data.fixtureId)
            .execute()
        ).length,
        0,
      );
    },
  );
  await t.test(
    'synthetic seasons cannot use native live transport',
    async () => {
      await nextFixture();
      await planProviderCollections(db);
      await resetPacing();
      const result = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
      );
      assert.equal(result.state, 'held');
      assert.equal(result.code, 'provider-synthetic-live-traffic-blocked');
      assert.equal(calls, 4);
    },
  );
  await t.test(
    'retired mappings hold collection before another charged request',
    async () => {
      const { mapping } = await nextFixture();
      await planProviderCollections(db);
      await db
        .updateTable('provider_identities')
        .set({ data: { ...mapping, state: 'retired' } })
        .where('id', '=', mapping.id)
        .execute();
      await resetPacing();
      const result = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      assert.equal(result.code, 'provider-collection-mapping-changed');
      assert.equal(result.attempted, false);
    },
  );
  await t.test(
    'kickoff changes, postponements and removed assignments hold queued traffic without charging quota',
    async () => {
      for (const change of ['kickoff', 'postponed', 'assignment'] as const) {
        const { fixture } = await nextFixture();
        await planProviderCollections(db);
        await resetPacing();
        const before = await db
          .selectFrom('provider_attempts')
          .select('id')
          .where('account_id', '=', accountId)
          .execute();
        const priorCalls = calls;
        if (change === 'assignment') {
          await db
            .deleteFrom('fixture_assignments')
            .where('fixture_id', '=', fixture.id)
            .execute();
        } else {
          const changed =
            change === 'kickoff'
              ? {
                  ...fixture,
                  kickoff: new Date(Date.now() + 48 * 3600_000).toISOString(),
                }
              : { ...fixture, status: 'postponed' as const };
          await db
            .updateTable('fixtures')
            .set({ kickoff: changed.kickoff, data: changed })
            .where('id', '=', fixture.id)
            .execute();
        }
        const result = await processNextProviderCollection(
          db,
          'synthetic-collection-key',
          transport,
        );
        assert.equal(result.state, 'held', change);
        assert.equal(
          result.code,
          'provider-collection-fixture-changed',
          change,
        );
        assert.equal(result.attempted, false, change);
        assert.equal(calls, priorCalls, change);
        const after = await db
          .selectFrom('provider_attempts')
          .select('id')
          .where('account_id', '=', accountId)
          .execute();
        assert.equal(after.length, before.length, change);
      }
    },
  );
  await t.test(
    'wrong requests, lost claims and correction-priority escalation reserve nothing',
    async () => {
      const { fixture } = await nextFixture();
      await planProviderCollections(db);
      await resetPacing();
      const row = await db
        .selectFrom('provider_collection_batches')
        .select('data')
        .where('fixture_id', '=', fixture.id)
        .executeTakeFirstOrThrow();
      const claimId = randomUUID();
      await db
        .updateTable('provider_collection_batches')
        .set({
          claim_id: claimId,
          claimed_until: new Date(Date.now() + 45_000),
        })
        .where('id', '=', row.data.id)
        .execute();
      const request = row.data.requests[0];
      assert.ok(request);
      const input = {
        accountId,
        attemptId: randomUUID(),
        request,
        priority: 'ordinary' as const,
        collection: { batchId: row.data.id, claimId, allowSynthetic: true },
      };
      for (const [candidate, code] of [
        [
          {
            ...input,
            request: { resource: 'fixtures/events' as const, fixture: 999999 },
          },
          'provider-collection-request-changed',
        ],
        [
          {
            ...input,
            collection: { ...input.collection, claimId: randomUUID() },
          },
          'provider-collection-lease-lost',
        ],
        [
          { ...input, priority: 'correction' as const },
          'provider-collection-ordinary-only',
        ],
      ] as const) {
        await assert.rejects(reserveProviderAttempt(db, candidate), { code });
      }
      assert.equal(
        (
          await db
            .selectFrom('provider_attempts')
            .select('id')
            .where('id', '=', input.attemptId)
            .execute()
        ).length,
        0,
      );
      assert.equal(
        (
          await db
            .selectFrom('provider_collection_attempts')
            .select('attempt_id')
            .where('batch_id', '=', row.data.id)
            .execute()
        ).length,
        0,
      );
      // A crash after reservation leaves an unknown, charged attempt. Recovery must wait,
      // retain its charge and evidence, then make a fresh attempt once uncertainty expires.
      await reserveProviderAttempt(db, input);
      await db
        .updateTable('provider_collection_batches')
        .set({ claimed_until: new Date(0) })
        .where('id', '=', row.data.id)
        .execute();
      await resetPacing();
      const priorCalls = calls;
      const pending = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      assert.equal(pending.code, 'provider-collection-attempt-pending');
      assert.equal(pending.attempted, false);
      assert.equal(calls, priorCalls);
      await db
        .updateTable('provider_attempts')
        .set({ reserved_at: new Date(Date.now() - 36_000) })
        .where('id', '=', input.attemptId)
        .execute();
      await resetPacing();
      const recovered = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      assert.equal(recovered.attempted, true);
      assert.equal(calls, priorCalls + 1);
      const attempts = await db
        .selectFrom('provider_collection_attempts')
        .select('attempt_id')
        .where('batch_id', '=', row.data.id)
        .where('step', '=', 0)
        .execute();
      assert.equal(attempts.length, 2);
      assert.ok(
        attempts.some((attempt) => attempt.attempt_id === input.attemptId),
      );
      const unknown = await db
        .selectFrom('provider_attempts')
        .select('finished_at')
        .where('id', '=', input.attemptId)
        .executeTakeFirstOrThrow();
      assert.equal(unknown.finished_at, null);
      // Cancel the partial bundle through a reviewed revision before the next scenario.
      schedule = await executeProviderScheduleCommand(db, principal, grants, {
        ...command,
        commandId: randomUUID(),
        expectedRevision: schedule.revision,
      });
    },
  );
  await t.test(
    'partial bundles expire and unsuccessful resource retries are bounded',
    async () => {
      const { fixture } = await nextFixture();
      await planProviderCollections(db);
      await resetPacing();
      await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      const batch = await db
        .selectFrom('provider_collection_batches')
        .select('data')
        .where('fixture_id', '=', fixture.id)
        .executeTakeFirstOrThrow();
      await db
        .updateTable('provider_collection_batches')
        .set({
          data: {
            ...batch.data,
            startedAt: new Date(Date.now() - 11 * 60000).toISOString(),
          },
        })
        .where('id', '=', batch.data.id)
        .execute();
      await resetPacing();
      assert.equal(
        (
          await processNextProviderCollection(
            db,
            'synthetic-collection-key',
            transport,
          )
        ).code,
        'provider-collection-expired',
      );
      await nextFixture();
      await planProviderCollections(db);
      let failures = 0;
      const failing: typeof fetch = () => {
        failures++;
        return Promise.resolve(new Response('invalid', { status: 500 }));
      };
      for (let i = 0; i < 3; i++) {
        await resetPacing();
        const result = await processNextProviderCollection(
          db,
          'synthetic-collection-key',
          failing,
        );
        assert.equal(result.state, i === 2 ? 'held' : 'collecting');
      }
      assert.equal(failures, 3);
      assert.equal(
        (
          await processNextProviderCollection(
            db,
            'synthetic-collection-key',
            failing,
          )
        ).state,
        'idle',
      );
    },
  );
  await t.test(
    'account pause and an exhausted ordinary budget prevent collection traffic',
    async () => {
      await nextFixture();
      await planProviderCollections(db);
      await resetPacing();
      const priorCalls = calls;
      await db
        .updateTable('provider_accounts')
        .set({ data: { ...account, state: 'paused' } })
        .where('id', '=', accountId)
        .execute();
      assert.equal(
        (
          await processNextProviderCollection(
            db,
            'synthetic-collection-key',
            transport,
          )
        ).state,
        'idle',
      );
      await db
        .updateTable('provider_accounts')
        .set({ data: account })
        .where('id', '=', accountId)
        .execute();
      assert.ok(account.resetAnchor);
      const window = providerQuotaWindow(account.resetAnchor, new Date());
      const budget = await db
        .selectFrom('provider_quota_windows')
        .selectAll()
        .where('account_id', '=', accountId)
        .where('starts_at', '=', window.starts)
        .executeTakeFirstOrThrow();
      await db
        .updateTable('provider_quota_windows')
        .set({ ordinary_ceiling: budget.ordinary_used })
        .where('account_id', '=', accountId)
        .where('starts_at', '=', window.starts)
        .execute();
      const deferred = await processNextProviderCollection(
        db,
        'synthetic-collection-key',
        transport,
      );
      assert.equal(deferred.attempted, false);
      assert.equal(deferred.code, 'provider-daily-limit');
      assert.equal(calls, priorCalls);
      const after = await db
        .selectFrom('provider_quota_windows')
        .select('used')
        .where('account_id', '=', accountId)
        .where('starts_at', '=', window.starts)
        .executeTakeFirstOrThrow();
      assert.equal(after.used, budget.used);
      // Restore only this isolated budget fixture, then supersede the queued scope with a reviewed revision.
      await db
        .updateTable('provider_quota_windows')
        .set({ ordinary_ceiling: budget.ordinary_ceiling })
        .where('account_id', '=', accountId)
        .where('starts_at', '=', window.starts)
        .execute();
      schedule = await executeProviderScheduleCommand(db, principal, grants, {
        ...command,
        commandId: randomUUID(),
        expectedRevision: schedule.revision,
      });
    },
  );
  await t.test(
    'pause cancels an in-flight batch without erasing its attempt or permitting the next resource',
    async () => {
      await nextFixture();
      await planProviderCollections(db);
      await resetPacing();
      let started: () => void = () => {},
        release: () => void = () => {};
      const arrived = new Promise<void>((resolve) => {
        started = resolve;
      });
      const unblock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const waiting: typeof fetch = async (input, init) => {
        started();
        await unblock;
        return transport(input, init);
      };
      const running = processNextProviderCollection(
        db,
        'synthetic-collection-key',
        waiting,
      );
      await arrived;
      schedule = await executeProviderScheduleCommand(db, principal, grants, {
        ...command,
        commandId: randomUUID(),
        expectedRevision: schedule.revision,
        enabled: false,
      });
      release();
      assert.equal((await running).state, 'cancelled');
      const priorCalls = calls;
      assert.equal(
        (
          await processNextProviderCollection(
            db,
            'synthetic-collection-key',
            transport,
          )
        ).state,
        'idle',
      );
      assert.equal(calls, priorCalls);
      await db
        .deleteFrom('staff_grants')
        .where('account_id', '=', principal.accountId)
        .execute();
      await assert.rejects(
        executeProviderScheduleCommand(db, principal, grants, command),
        { name: 'AccessDenied' },
      );
    },
  );
  if (existing)
    await db
      .updateTable('provider_accounts')
      .set({
        revision: existing.revision,
        data: existing.data,
        cooldown_until: existing.cooldown_until,
        inflight_attempt_id: existing.inflight_attempt_id,
        inflight_until: existing.inflight_until,
        next_dispatch_at: existing.next_dispatch_at,
        minute_headroom: existing.minute_headroom,
        minute_headroom_until: existing.minute_headroom_until,
        observed_minute_limit: existing.observed_minute_limit,
        consecutive_failures: existing.consecutive_failures,
      })
      .where('id', '=', accountId)
      .execute();
});
