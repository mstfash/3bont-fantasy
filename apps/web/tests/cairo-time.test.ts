import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cairoWallTime, resolveCairoTime } from '../src/lib/cairo-time.ts';
void test('Cairo entry is independent of the browser or server local timezone', () => {
  assert.deepEqual(resolveCairoTime('2026-09-18T20:00'), {
    kind: 'valid',
    instant: '2026-09-18T17:00:00Z',
  });
  assert.equal(cairoWallTime('2026-09-18T17:00:00Z'), '2026-09-18T20:00');
});
void test('skipped hours are rejected and repeated hours require an explicit choice', () => {
  assert.deepEqual(resolveCairoTime('2026-04-24T00:30'), { kind: 'invalid' });
  const overlap = resolveCairoTime('2026-10-29T23:30');
  assert.equal(overlap.kind, 'ambiguous');
  assert.equal(
    Date.parse(overlap.later) - Date.parse(overlap.earlier),
    3600_000,
  );
  assert.deepEqual(resolveCairoTime('not a date'), { kind: 'invalid' });
});
