import assert from 'node:assert/strict';

/** Retain no response bodies, credentials, query strings or console payloads. */
export function monitorPageHealth(page, base) {
  const failures = [];
  page.on('crash', () => failures.push('Browser page crashed'));
  page.on('pageerror', (error) =>
    failures.push(`Uncaught browser error: ${error.name}`),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(base).origin && response.status() >= 500)
      failures.push(`HTTP ${response.status()} ${url.pathname}`);
  });
  return () =>
    assert.deepEqual(
      failures,
      [],
      'Browser must have no crashes, uncaught errors or application HTTP 5xx responses',
    );
}
