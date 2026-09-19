import { providerAcceptanceMigration } from './migrations/0025-provider-acceptance.ts';
import { exceptionalSettlementMigration } from './migrations/0023-exceptional-settlement.ts';
import { providerSchedulesMigration } from './migrations/0022-provider-schedules.ts';
import { providerNormalizationMigration } from './migrations/0021-provider-normalization.ts';
import { priceCalibrationMigration } from './migrations/0020-price-calibration.ts';
import { providerIdentitiesMigration } from './migrations/0019-provider-identities.ts';
import { accountClosureMigration } from './migrations/0018-account-closure.ts';
import { groupHandoverMigration } from './migrations/0017-group-handover.ts';
import { accountExportsMigration } from './migrations/0016-account-exports.ts';
import { workerHealthMigration } from './migrations/0015-worker-health.ts';
import { providerGatewayMigration } from './migrations/0014-provider-gateway.ts';
import { prizeCorrectionsMigration } from './migrations/0013-prize-corrections.ts';
import { entryRetirementMigration } from './migrations/0012-entry-retirement.ts';
import { sponsorsMigration } from './migrations/0011-sponsors.ts';
import { chatMigration } from './migrations/0010-chat.ts';
import { achievementsMigration } from './migrations/0009-achievements.ts';
import { prizesMigration } from './migrations/0008-prizes.ts';
import { chipGrantsMigration } from './migrations/0007-chip-grants.ts';
import { headToHeadMigration } from './migrations/0006-head-to-head.ts';
import { leagueGroupsMigration } from './migrations/0005-league-groups.ts';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { withTransaction } from './transactions.ts';
import { priceBatchesMigration } from './migrations/0004-price-batches.ts';
import { matchResultsMigration } from './migrations/0003-match-results.ts';
import { coreMigration } from './migrations/0001-core.ts';
import { staffSecurityMigration } from './migrations/0002-staff-security.ts';
import { snapshotRepairsMigration } from './migrations/0024-snapshot-repairs.ts';

const applicationMigrations = [
  coreMigration,
  staffSecurityMigration,
  matchResultsMigration,
  priceBatchesMigration,
  leagueGroupsMigration,
  headToHeadMigration,
  chipGrantsMigration,
  prizesMigration,
  achievementsMigration,
  chatMigration,
  sponsorsMigration,
  entryRetirementMigration,
  prizeCorrectionsMigration,
  providerGatewayMigration,
  workerHealthMigration,
  accountExportsMigration,
  groupHandoverMigration,
  accountClosureMigration,
  providerIdentitiesMigration,
  priceCalibrationMigration,
  providerNormalizationMigration,
  providerSchedulesMigration,
  exceptionalSettlementMigration,
  snapshotRepairsMigration,
  providerAcceptanceMigration,
] as const;

export async function migrateApplication(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('3bont-fantasy:migrations',0))",
    );
    await client.query('CREATE SCHEMA IF NOT EXISTS fantasy');
    await client.query(
      'CREATE TABLE IF NOT EXISTS fantasy.schema_migrations(id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const migration of applicationMigrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      const result = await client.query<{ checksum: string }>(
        'SELECT checksum FROM fantasy.schema_migrations WHERE id=$1',
        [migration.id],
      );
      const existing = result.rows[0];
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(`Applied migration changed: ${migration.id}`);
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO fantasy.schema_migrations(id,checksum) VALUES($1,$2)',
        [migration.id, checksum],
      );
    }
  });
}

/** Checks every migration required by this build; additive newer migrations permit code rollback. */
export async function applicationSchemaReady(pool: Pool): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    await client.query("SET LOCAL statement_timeout='2s'");
    const primary = await client.query<{ writable: boolean }>(
      "SELECT NOT pg_is_in_recovery() AND current_setting('transaction_read_only')='off' AS writable",
    );
    if (!primary.rows[0]?.writable) return false;
    const result = await client.query<{ id: string; checksum: string }>(
      'SELECT id,checksum FROM fantasy.schema_migrations WHERE id=ANY($1::text[])',
      [applicationMigrations.map((m) => m.id)],
    );
    return applicationMigrations.every((m) =>
      result.rows.some(
        (r) =>
          r.id === m.id &&
          r.checksum === createHash('sha256').update(m.sql).digest('hex'),
      ),
    );
  });
}
