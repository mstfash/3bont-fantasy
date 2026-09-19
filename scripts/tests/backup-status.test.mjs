import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessBackupInformation } from '../backup-operations.mjs';
const now = Date.parse('2026-09-19T12:00:00Z');
const full = { type: 'full', timestamp: { stop: (now - 3600000) / 1000 } };
const info = (backup = [full]) => [
  { name: 'fantasy', status: { code: 0 }, cipher: 'aes-256-cbc', backup },
];
test('encrypted recent full/differential metadata is usable after the archive check', () => {
  assert.equal(assessBackupInformation(info(), now).status, 'ready');
  assert.equal(
    assessBackupInformation(
      info([
        { ...full, timestamp: { stop: (now - 7 * 86400000) / 1000 } },
        { type: 'diff', timestamp: { stop: (now - 3600000) / 1000 } },
      ]),
      now,
    ).status,
    'ready',
  );
});
test('missing, unencrypted and unhealthy repositories cannot produce ready backup status', () => {
  for (const candidate of [
    null,
    [],
    [{ ...info()[0], cipher: 'none' }],
    [{ ...info()[0], status: { code: 2 } }],
    info([]),
    info([null]),
    info([{ ...full, type: 'diff' }]),
  ])
    assert.equal(assessBackupInformation(candidate, now).status, 'unavailable');
});
test('stale, future or malformed backup timestamps fail closed', () => {
  for (const stop of [
    (now - 27 * 3600000) / 1000,
    (now + 60000) / 1000,
    null,
    'today',
    -1,
  ])
    assert.equal(
      assessBackupInformation(info([{ ...full, timestamp: { stop } }]), now)
        .status,
      'unavailable',
    );
});
