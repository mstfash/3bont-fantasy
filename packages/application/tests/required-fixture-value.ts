import assert from 'node:assert/strict';
/** A missing fixture identity or source row must fail the test before it can exercise production code. */
export function requiredFixtureValue<T>(value: T | null | undefined): T {
  assert.ok(
    value !== null && value !== undefined,
    'Required fixture value is missing',
  );
  return value;
}
