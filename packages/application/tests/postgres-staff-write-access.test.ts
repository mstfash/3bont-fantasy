import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { catalogueCommandSchema } from '@fantasy/contracts';
import { executeCatalogueCommand } from '../src/catalogue.ts';
import { AccessDenied } from '../src/authorization.ts';
import { requireCurrentStaffWrite } from '../src/staff-write-access.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 4 }),
  db = createDatabase(pool),
  actorId = `write-proof-${randomUUID()}`;
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('staff writes recheck stored grants after revocation waits, protect retries and hold permission until commit', async () => {
  const principal = {
      accountId: actorId,
      sessionId: 'write-session',
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, actorId, grants);
  const command = catalogueCommandSchema.parse({
    kind: 'season',
    commandId: randomUUID(),
    expectedFingerprint: null,
    reason: 'Synthetic authorization boundary proof',
    season: {
      id: randomUUID(),
      name: { ar: 'اختبار الصلاحيات', en: 'Authorization proof' },
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      synthetic: true,
    },
  });
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management',0))",
    );
    const attempt = executeCatalogueCommand(db, principal, grants, command);
    const rejection = assert.rejects(attempt, AccessDenied);
    await blocker.query(
      'DELETE FROM fantasy.staff_grants WHERE account_id=$1',
      [actorId],
    );
    await blocker.query('COMMIT');
    await rejection;
    assert.equal(
      (
        await db
          .selectFrom('commands')
          .select('command_id')
          .where('actor_id', '=', actorId)
          .execute()
      ).length,
      0,
    );
    await grantProofStaff(db, actorId, grants);
    await executeCatalogueCommand(db, principal, grants, command);
    await blocker.query('BEGIN');
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management',0))",
    );
    await blocker.query(
      'DELETE FROM fantasy.staff_grants WHERE account_id=$1',
      [actorId],
    );
    await blocker.query('COMMIT');
    await assert.rejects(
      executeCatalogueCommand(db, principal, grants, command),
      AccessDenied,
    );
    await grantProofStaff(db, actorId, grants);
    await db.transaction().execute(async (tx) => {
      await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
      await blocker.query('BEGIN');
      await blocker.query("SET LOCAL lock_timeout='75ms'");
      await assert.rejects(
        blocker.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('staff-management',0))",
        ),
        (e) => e instanceof Error && 'code' in e && e.code === '55P03',
      );
      await blocker.query('ROLLBACK');
    });
    await blocker.query('BEGIN');
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management',0))",
    );
    const almostExpired = {
      ...principal,
      mfaVerifiedAt: new Date(Date.now() - 15 * 60000 + 100),
    };
    const stale = assert.rejects(
      executeCatalogueCommand(db, almostExpired, grants, {
        ...command,
        commandId: randomUUID(),
      }),
      AccessDenied,
    );
    await blocker.query('SELECT pg_sleep(0.15)');
    await blocker.query('COMMIT');
    await stale;
    await db
      .updateTable('accounts')
      .set({ closed_at: new Date() })
      .where('id', '=', actorId)
      .execute();
    await assert.rejects(
      executeCatalogueCommand(db, principal, grants, command),
      AccessDenied,
    );
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
});
