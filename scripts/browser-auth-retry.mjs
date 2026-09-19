import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

/** Retry only explicit throttling; never retry failed credentials or an uncertain write. */
export async function withAuthRateLimit(
  send,
  { wait = setTimeout, notice = console.log } = {},
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await send();
    if (response.status() !== 429) return response;
    if (attempt === 2)
      throw new Error(
        'Authentication rate limit did not clear after three attempts',
      );
    const header = response.headers()['retry-after'];
    const seconds = header === undefined ? 60 : Number(header);
    assert.ok(
      header !== '' &&
        Number.isFinite(seconds) &&
        seconds >= 0 &&
        seconds <= 60,
      'Expected a bounded authentication Retry-After delay',
    );
    notice(
      'Authentication rate limit observed; waiting for its window before retrying.',
    );
    // Short chunks keep progress visible without changing the server's rate-limit state.
    let remaining = seconds * 1000 + 250;
    while (remaining > 0) {
      const delay = Math.min(remaining, 30_000);
      await wait(delay);
      remaining -= delay;
    }
  }
  throw new Error('Unreachable authentication retry state');
}
