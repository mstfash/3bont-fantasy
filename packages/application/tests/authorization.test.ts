import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requireCapability,
  requireEntryOwner,
  type Principal,
} from '../src/authorization.ts';

const now = new Date('2026-09-18T18:00:00Z');
const principal: Principal = {
  accountId: 'a',
  sessionId: 's',
  emailVerified: true,
  authenticatedAt: now,
  mfaVerifiedAt: now,
};
void test('staff scope and MFA are required even when a role otherwise allows the action', () => {
  const grants = [
    { role: 'competition-manager', competitionId: 'one' },
  ] as const;
  assert.doesNotThrow(() => {
    requireCapability(principal, grants, 'competition.manage', 'one', now);
  });
  assert.throws(() => {
    requireCapability(principal, grants, 'competition.manage', 'two', now);
  }, /Access denied/);
  assert.throws(() => {
    requireCapability(
      { ...principal, mfaVerifiedAt: null },
      grants,
      'competition.manage',
      'one',
      now,
    );
  }, /Access denied/);
  assert.throws(() => {
    requireCapability(
      { ...principal, mfaVerifiedAt: new Date('invalid') },
      grants,
      'competition.manage',
      'one',
      now,
    );
  }, /Access denied/);
  assert.throws(() => {
    requireCapability(
      principal,
      [{ role: 'data-steward', competitionId: 'one' }],
      'facts.manage',
      null,
      now,
    );
  }, /Access denied/);
});
void test('sensitive operations demand recent authentication and staff roles do not confer entry ownership', () => {
  // Past timestamps in integration fixtures must not weaken future-proof rejection.
  for (const field of ['mfaVerifiedAt', 'authenticatedAt'] as const)
    assert.throws(() => {
      requireCapability(
        { ...principal, [field]: new Date(now.getTime() + 1) },
        [{ role: 'owner', competitionId: null }],
        'staff.manage',
        null,
        now,
        true,
      );
    }, /Access denied/);
  const stale = {
    ...principal,
    authenticatedAt: new Date(now.getTime() - 16 * 60_000),
  };
  assert.throws(() => {
    requireCapability(
      stale,
      [{ role: 'owner', competitionId: null }],
      'staff.manage',
      null,
      now,
      true,
    );
  }, /Access denied/);
  assert.throws(() => {
    requireEntryOwner(principal, 'other');
  }, /Access denied/);
  assert.throws(() => {
    requireEntryOwner({ ...principal, emailVerified: false }, 'a');
  }, /Access denied/);
  assert.doesNotThrow(() => {
    requireEntryOwner(principal, 'a');
  });
});
