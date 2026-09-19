import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withAuthRateLimit } from '../browser-auth-retry.mjs';

const response = (status, retryAfter) => ({
  status: () => status,
  headers: () =>
    retryAfter === undefined ? {} : { 'retry-after': retryAfter },
});
const noNotice = { notice: () => {} };

test('auth setup retries only explicit throttling and respects Retry-After', async () => {
  const delays = [];
  let calls = 0;
  const result = await withAuthRateLimit(
    () => {
      calls++;
      return calls === 1 ? response(429, '60') : response(200);
    },
    {
      ...noNotice,
      wait: async (delay) => {
        delays.push(delay);
      },
    },
  );
  assert.equal(result.status(), 200);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [30_000, 30_000, 250]);
});

test('auth setup never retries non-throttle failures or uncertain network writes', async () => {
  for (const status of [200, 400, 401, 403, 409, 500, 503]) {
    let calls = 0;
    const result = await withAuthRateLimit(() => {
      calls++;
      return response(status);
    });
    assert.equal(result.status(), status);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    withAuthRateLimit(() => {
      calls++;
      throw new Error('connection lost');
    }),
    /connection lost/u,
  );
  assert.equal(calls, 1);
});

test('auth setup has a finite retry budget and does not wait after its last attempt', async () => {
  let calls = 0,
    waits = 0;
  await assert.rejects(
    withAuthRateLimit(
      () => {
        calls++;
        return response(429, '1');
      },
      {
        ...noNotice,
        wait: async () => {
          waits++;
        },
      },
    ),
    /three attempts/u,
  );
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});

test('unexpected throttle delays fail visibly instead of hanging or retrying early', async () => {
  for (const header of ['', '-1', '61', 'NaN', 'Infinity', 'tomorrow']) {
    let calls = 0;
    await assert.rejects(
      withAuthRateLimit(
        () => {
          calls++;
          return response(429, header);
        },
        {
          ...noNotice,
          wait: async () => {
            assert.fail('Must not wait');
          },
        },
      ),
      /bounded authentication/u,
    );
    assert.equal(calls, 1);
  }
});
