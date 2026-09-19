import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, before, after } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { executeProviderCommand } from '../src/provider-commands.ts';
import {
  reserveProviderAttempt,
  providerQuotaWindow,
} from '../src/provider-quota.ts';
import { recordProviderOutcome } from '../src/provider-outcomes.ts';
import { fetchProviderResource } from '../src/provider-gateway.ts';
import { pauseProviderTrafficAfterRestore } from '../src/provider-query.ts';
import { readProviderEvidence } from '../src/provider-evidence.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
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
  await db.destroy();
});
const reject = (code: string) => (error: unknown) =>
  error instanceof CommandRejected && error.code === code;
void test('provider gateway proves durable ceilings, dispatch contention, header tightening, timeout charging and restore reconciliation without outbound calls', async (t) => {
  const operator = randomUUID();
  await db
    .insertInto('accounts')
    .values({
      id: operator,
      display_name: 'Quota proof operator',
      suspended_until: null,
    })
    .execute();
  await db
    .insertInto('staff_grants')
    .values({
      id: randomUUID(),
      account_id: operator,
      role: 'data-steward',
      competition_id: null,
      granted_by: operator,
    })
    .execute();
  const principal = {
      accountId: operator,
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'data-steward' as const, competitionId: null }];
  const configured = await executeProviderCommand(db, principal, grants, {
    kind: 'configure',
    commandId: randomUUID(),
    expectedRevision: 0,
    dailyLimit: 10,
    minuteLimit: 100,
    resetAnchor: new Date(Date.now() - 3600_000).toISOString(),
    dedicatedKeyConfirmed: true,
    reason: 'Configure synthetic dedicated account',
    evidenceReference: 'Synthetic quota and verified rolling reset fixture',
  });
  const accountId = configured.account.id,
    request = { resource: 'status' as const };
  const reserve = (
    priority: 'ordinary' | 'correction' = 'ordinary',
    attemptId: string = randomUUID(),
  ) => reserveProviderAttempt(db, { accountId, request, priority, attemptId });
  const state = async () =>
    await db
      .selectFrom('provider_accounts')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow();
  const budget = async () =>
    await db
      .selectFrom('provider_quota_windows')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('starts_at', 'desc')
      .executeTakeFirstOrThrow();
  const finish = (id: string) =>
    recordProviderOutcome(db, id, {
      outcome: 'success',
      status: 200,
      checksum: null,
      dailyLimit: null,
      dailyRemaining: null,
      minuteRemaining: null,
      minuteLimit: null,
      retryAfterSeconds: null,
    });
  // Controlled fixture time movement; the production API cannot remove a cooldown or refund an attempt.
  const elapsed = async () => {
    await db
      .updateTable('provider_accounts')
      .set({
        cooldown_until: null,
        next_dispatch_at: null,
        inflight_until: null,
        inflight_attempt_id: null,
      })
      .where('id', '=', accountId)
      .execute();
  };
  await t.test(
    'unknown quota makes no request; configured accounts remain paused until usage is verified',
    async () => {
      let calls = 0;
      const transport: typeof fetch = () => {
        calls++;
        return Promise.resolve(Response.json({}));
      };
      await assert.rejects(
        fetchProviderResource(
          db,
          {
            accountId,
            request,
            priority: 'ordinary',
            apiKey: 'synthetic-secret-key',
          },
          transport,
        ),
        reject('provider-quota-unverified'),
      );
      assert.equal(calls, 0);
      assert.ok(configured.account.resetAnchor);
      const window = providerQuotaWindow(
        configured.account.resetAnchor,
        new Date(),
      );
      await executeProviderCommand(db, principal, grants, {
        kind: 'reconcile',
        commandId: randomUUID(),
        expectedRevision: 1,
        usedToday: 0,
        windowStart: window.starts.toISOString(),
        reason: 'Synthetic initial usage check',
        evidenceReference: 'Synthetic provider dashboard zero usage',
      });
      await assert.rejects(reserve(), reject('provider-backoff'));
      await elapsed();
    },
  );
  await t.test(
    'competing workers get one dispatch lease; ordinary traffic preserves the correction reserve',
    async () => {
      const attempts = await Promise.allSettled(
        Array.from({ length: 30 }, () => reserve()),
      );
      const admitted = attempts.filter((r) => r.status === 'fulfilled');
      assert.equal(admitted.length, 1);
      const first = admitted[0];
      assert.ok(first?.status === 'fulfilled');
      await finish(first.value.attemptId);
      await elapsed();
      await assert.rejects(
        reserve('ordinary', first.value.attemptId),
        reject('provider-attempt-already-reserved'),
      );
      for (let n = 1; n < 9; n++) {
        const a = await reserve();
        await finish(a.attemptId);
        await elapsed();
      }
      await assert.rejects(reserve(), reject('provider-daily-limit'));
      const recovery = await reserve('correction');
      await finish(recovery.attemptId);
      await elapsed();
      await assert.rejects(
        reserve('correction'),
        reject('provider-daily-limit'),
      );
      assert.equal((await budget()).used, 10);
      assert.equal((await budget()).ordinary_used, 9);
      const newerPool = new Pool({ connectionString, max: 1 }),
        other = createDatabase(newerPool);
      try {
        await assert.rejects(
          reserveProviderAttempt(other, {
            accountId,
            request,
            priority: 'correction',
            attemptId: randomUUID(),
          }),
          reject('provider-daily-limit'),
        );
      } finally {
        await other.destroy();
      }
    },
  );
  await t.test(
    'a verified new window refills daily allowance; rolling minute limits persist across resets',
    async () => {
      const row = await state();
      const anchor = new Date(Date.now() - 1000).toISOString();
      await db
        .updateTable('provider_accounts')
        .set({ data: { ...row.data, resetAnchor: anchor, minuteLimit: 10 } })
        .where('id', '=', accountId)
        .execute();
      await assert.rejects(reserve(), reject('provider-minute-limit'));
      await pool.query(
        "UPDATE fantasy.provider_attempts SET reserved_at=reserved_at-interval '2 minutes' WHERE account_id=$1",
        [accountId],
      );
      const a = await reserve();
      assert.equal((await budget()).used, 1);
      await finish(a.attemptId);
      await elapsed();
    },
  );
  await t.test(
    'lower headers tighten budgets and stale higher headers never restore headroom',
    async () => {
      const a = await reserve();
      await recordProviderOutcome(db, a.attemptId, {
        outcome: 'success',
        status: 200,
        checksum: null,
        dailyLimit: 10,
        dailyRemaining: 2,
        minuteRemaining: 1,
        minuteLimit: 10,
        retryAfterSeconds: null,
      });
      await elapsed();
      assert.equal((await budget()).ceiling, 4);
      const b = await reserve();
      await recordProviderOutcome(db, b.attemptId, {
        outcome: 'success',
        status: 200,
        checksum: null,
        dailyLimit: 100,
        dailyRemaining: 99,
        minuteRemaining: 99,
        minuteLimit: 100,
        retryAfterSeconds: null,
      });
      await elapsed();
      assert.equal((await budget()).ceiling, 4);
      assert.equal((await state()).minute_headroom, 0);
      await assert.rejects(
        reserve('correction'),
        reject('provider-minute-limit'),
      );
    },
  );
  await t.test(
    'timeouts, invalid payloads and rate limits remain charged; evidence is redacted and deduplicated',
    async () => {
      const row = await state();
      await db
        .updateTable('provider_accounts')
        .set({
          data: {
            ...row.data,
            resetAnchor: new Date(Date.now() - 500).toISOString(),
            dailyLimit: 100,
            minuteLimit: 100,
          },
          minute_headroom: null,
          minute_headroom_until: null,
          observed_minute_limit: null,
        })
        .where('id', '=', accountId)
        .execute();
      await elapsed();
      const timeouts: typeof fetch = () =>
        Promise.reject(new Error('Synthetic uncertain timeout'));
      const uncertain = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'synthetic-secret-key',
        },
        timeouts,
      );
      assert.equal(uncertain.outcome, 'unconfirmed');
      assert.equal((await budget()).used, 1);
      await elapsed();
      const invalid: typeof fetch = () =>
        Promise.resolve(
          new Response('malformed synthetic-secret-key', {
            headers: { 'x-ratelimit-requests-remaining': '5' },
          }),
        );
      const invalidResult = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'synthetic-secret-key',
        },
        invalid,
      );
      assert.equal(invalidResult.outcome, 'schema-invalid');
      assert.ok(invalidResult.evidenceId);
      const retainedInvalid = await db
        .selectFrom('provider_evidence')
        .select('payload')
        .where('id', '=', invalidResult.evidenceId)
        .executeTakeFirstOrThrow();
      assert.deepEqual(retainedInvalid.payload, {
        invalidResponse: { unparsedBody: 'malformed [redacted]' },
      });
      const reviewed = await readProviderEvidence(
        db,
        principal,
        grants,
        invalidResult.attemptId,
      );
      assert.equal(reviewed?.outcome, 'schema-invalid');
      assert.deepEqual(reviewed.evidence?.payload, retainedInvalid.payload);
      await assert.rejects(
        readProviderEvidence(
          db,
          principal,
          [{ role: 'data-steward', competitionId: randomUUID() }],
          invalidResult.attemptId,
        ),
        AccessDenied,
      );
      assert.equal(
        await readProviderEvidence(db, principal, grants, randomUUID()),
        null,
      );
      assert.equal((await budget()).used, 2);
      await elapsed();
      const valid: typeof fetch = (url, init) => {
        assert.ok(url instanceof URL);
        assert.equal(url.origin, 'https://v3.football.api-sports.io');
        assert.equal(init?.redirect, 'error');
        return Promise.resolve(
          Response.json({
            get: 'status',
            parameters: [],
            errors: [],
            results: 1,
            paging: { current: 1, total: 1 },
            response: {
              'synthetic-secret-key': 'secret used as a JSON key',
              apiKey: 'synthetic-secret-key',
              note: 'Do not expose synthetic-secret-key',
            },
          }),
        );
      };
      const x = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'synthetic-secret-key',
        },
        valid,
      );
      assert.equal(x.outcome, 'success');
      assert.ok(x.evidenceId);
      await elapsed();
      const y = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'synthetic-secret-key',
        },
        valid,
      );
      assert.equal(x.evidenceId, y.evidenceId);
      assert.equal((await budget()).used, 4);
      const evidence = (
        await db
          .selectFrom('provider_evidence')
          .select('payload')
          .where('id', '=', x.evidenceId)
          .executeTakeFirstOrThrow()
      ).payload;
      assert.equal(
        JSON.stringify(evidence).includes('synthetic-secret-key'),
        false,
      );
      await elapsed();
      const limited: typeof fetch = () =>
        Promise.resolve(
          new Response('{}', {
            status: 429,
            headers: { 'Retry-After': '120' },
          }),
        );
      assert.equal(
        (
          await fetchProviderResource(
            db,
            {
              accountId,
              request,
              priority: 'correction',
              apiKey: 'synthetic-secret-key',
            },
            limited,
          )
        ).outcome,
        'rate-limited',
      );
      assert.equal((await budget()).used, 5);
      await assert.rejects(reserve('correction'), reject('provider-backoff'));
    },
  );
  await t.test(
    'restore pauses traffic and cannot reconcile a lower usage or the wrong window',
    async () => {
      await pauseProviderTrafficAfterRestore(db);
      await elapsed();
      await assert.rejects(
        reserve('correction'),
        reject('provider-quota-unverified'),
      );
      const row = await state();
      assert.ok(row.data.resetAnchor);
      const window = providerQuotaWindow(row.data.resetAnchor, new Date());
      const command = {
        kind: 'reconcile' as const,
        commandId: randomUUID(),
        expectedRevision: row.revision,
        usedToday: 4,
        windowStart: window.starts.toISOString(),
        reason: 'Restored backup needs external usage reconciliation',
        evidenceReference: 'Synthetic current provider dashboard usage',
      };
      await assert.rejects(
        executeProviderCommand(db, principal, grants, command),
        reject('provider-usage-cannot-decrease'),
      );
      await assert.rejects(
        executeProviderCommand(db, principal, grants, {
          ...command,
          usedToday: 5,
          windowStart: new Date(0).toISOString(),
        }),
        reject('provider-window-changed'),
      );
      await executeProviderCommand(db, principal, grants, {
        ...command,
        usedToday: 5,
      });
      assert.equal((await state()).data.state, 'enabled');
      assert.equal((await budget()).used, 5);
    },
  );
  await t.test(
    'an expired dispatch never sends, near-reset attempts stop, and late outcomes cannot release a newer lease',
    async () => {
      const row = await state();
      await db
        .updateTable('provider_accounts')
        .set({
          data: {
            ...row.data,
            resetAnchor: new Date(Date.now() - 86400000 + 3000).toISOString(),
          },
        })
        .where('id', '=', accountId)
        .execute();
      await elapsed();
      await assert.rejects(
        reserve('correction'),
        reject('provider-reset-near'),
      );
      await db
        .updateTable('provider_accounts')
        .set({ data: row.data })
        .where('id', '=', accountId)
        .execute();
      const old = await reserve('correction');
      await elapsed();
      const newer = await reserve('correction');
      await finish(old.attemptId);
      assert.equal((await state()).inflight_attempt_id, newer.attemptId);
      await finish(newer.attemptId);
      assert.equal((await state()).inflight_attempt_id, null);
      // Give this isolated fixture a new provider window, then wait on its row lock beyond dispatch validity.
      const current = await state();
      await db
        .updateTable('provider_accounts')
        .set({
          data: {
            ...current.data,
            resetAnchor: new Date(Date.now() - 500).toISOString(),
          },
          minute_headroom: null,
          minute_headroom_until: null,
        })
        .where('id', '=', accountId)
        .execute();
      await elapsed();
      const blocker = await pool.connect();
      let calls = 0;
      const transport: typeof fetch = () => {
        calls++;
        return Promise.resolve(Response.json({}));
      };
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT id FROM fantasy.provider_accounts WHERE id=$1 FOR UPDATE',
        [accountId],
      );
      const work = fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'correction',
          apiKey: 'synthetic-secret-key',
        },
        transport,
      );
      try {
        await blocker.query('SELECT pg_sleep(5.1)');
        await blocker.query('COMMIT');
        await assert.rejects(work, reject('provider-dispatch-expired'));
        assert.equal(calls, 0);
        assert.equal((await budget()).used, 1);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled([work]);
      }
    },
  );
  await t.test(
    'oversized response bodies still apply restrictive headers and consume their reservation',
    async () => {
      await elapsed();
      const large: typeof fetch = () =>
        Promise.resolve(
          new Response(new Uint8Array(2000001), {
            headers: { 'x-ratelimit-requests-remaining': '0' },
          }),
        );
      const result = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'correction',
          apiKey: 'synthetic-secret-key',
        },
        large,
      );
      assert.equal(result.outcome, 'schema-invalid');
      assert.equal((await budget()).used, 2);
      assert.equal((await budget()).ceiling, 2);
    },
  );
  await t.test(
    'HTTP 200 season entitlement errors remain charged failures and hold immediate retries',
    async () => {
      const current = await state();
      await db
        .updateTable('provider_accounts')
        .set({
          data: {
            ...current.data,
            resetAnchor: new Date(Date.now() - 500).toISOString(),
            dailyLimit: 100,
            minuteLimit: 100,
          },
          minute_headroom: null,
          minute_headroom_until: null,
          observed_minute_limit: null,
          consecutive_failures: 0,
        })
        .where('id', '=', accountId)
        .execute();
      await elapsed();
      let calls = 0;
      // Observed live on 2026-09-19; all test traffic uses this controlled transport.
      const planError =
        'Free plans do not have access to this season, try from 2022 to 2024.';
      const denied: typeof fetch = () => {
        calls++;
        return Promise.resolve(
          Response.json({
            get: 'leagues',
            parameters: { country: 'Egypt', season: '2026' },
            errors: { plan: planError },
            results: 0,
            paging: { current: 1, total: 1 },
            response: [],
          }),
        );
      };
      const input = {
        accountId,
        request: {
          resource: 'leagues' as const,
          country: 'Egypt' as const,
          season: 2026,
        },
        priority: 'ordinary' as const,
        apiKey: 'synthetic-secret-key',
      };
      const result = await fetchProviderResource(db, input, denied);
      assert.equal(result.outcome, 'provider-error');
      assert.ok(result.evidenceId);
      const evidence = await db
        .selectFrom('provider_evidence')
        .select('payload')
        .where('id', '=', result.evidenceId)
        .executeTakeFirstOrThrow();
      assert.partialDeepStrictEqual(evidence.payload, {
        errors: { plan: planError },
      });
      assert.equal((await budget()).used, 1);
      await assert.rejects(
        fetchProviderResource(db, input, denied),
        reject('provider-backoff'),
      );
      assert.equal(calls, 1);
      assert.equal((await budget()).used, 1);
    },
  );
});
