import { readCalibrationBasis } from './price-calibration-basis.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import { calibratePrices } from '@fantasy/domain';
import {
  priceCalibrationCommandSchema,
  priceCalibrationReportSchema,
  priceCalibrationResultSchema,
  type PriceCalibrationCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { CommandRejected } from './errors.ts';

export async function createPriceCalibration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: PriceCalibrationCommand,
) {
  const command = priceCalibrationCommandSchema.parse(input);
  requireCapability(
    principal,
    grants,
    'competition.manage',
    command.competitionId,
    new Date(),
    true,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  const previous = await db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'competition.manage',
      command.competitionId,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return priceCalibrationResultSchema.parse(cached.result);
    }
    const recent = await tx
      .selectFrom('price_calibration_runs')
      .select('id')
      .where('competition_id', '=', command.competitionId)
      .where('created_at', '>', sql<Date>`clock_timestamp()-interval '1 hour'`)
      .limit(12)
      .execute();
    if (recent.length >= 12)
      throw new CommandRejected('calibration-hourly-limit');
    return null;
  });
  if (previous) return previous;
  // Compute from one read snapshot. Saving below rechecks live authority after taking its shared barrier.
  const basis = await readCalibrationBasis(db, command.competitionId);
  let output;
  try {
    output = calibratePrices(
      basis.players,
      basis.rounds,
      basis.squad,
      command.candidates,
      basis.cutoff,
    );
  } catch (error) {
    if (error instanceof RangeError)
      throw new CommandRejected('calibration-policy-or-calendar-invalid');
    throw error;
  }
  const report = priceCalibrationReportSchema.parse({
    id: randomUUID(),
    basisFingerprint: createHash('sha256')
      .update(JSON.stringify(basis))
      .digest('hex'),
    basis,
    candidates: command.candidates,
    output,
  });
  if (Buffer.byteLength(JSON.stringify(report)) > 12 * 1024 * 1024)
    throw new CommandRejected('calibration-report-too-large');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'competition.manage',
      command.competitionId,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`price-calibration:${command.competitionId}`},0))`.execute(
      tx,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return priceCalibrationResultSchema.parse(cached.result);
    }
    const recent = await tx
      .selectFrom('price_calibration_runs')
      .select('id')
      .where('competition_id', '=', command.competitionId)
      .where('created_at', '>', sql<Date>`clock_timestamp()-interval '1 hour'`)
      .limit(12)
      .execute();
    if (recent.length >= 12)
      throw new CommandRejected('calibration-hourly-limit');
    await tx
      .insertInto('price_calibration_runs')
      .values({
        id: report.id,
        competition_id: command.competitionId,
        actor_id: principal.accountId,
        payload: report,
      })
      .execute();
    for (const round of basis.rounds.filter((r) => r.finalizedAt !== null))
      await tx
        .insertInto('price_calibration_sources')
        .values({
          report_id: report.id,
          gameweek_id: round.id,
          revision: round.revision,
        })
        .execute();
    const result = { reportId: report.id };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        result,
        accepted_at: new Date(),
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'prices.calibration-saved',
        scope_id: command.competitionId,
        reason: command.reason,
        payload: {
          reportId: report.id,
          basisFingerprint: report.basisFingerprint,
        },
      })
      .execute();
    return result;
  });
}

export async function readPriceCalibration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
  reportId: string,
) {
  requireCapability(
    principal,
    grants,
    'competition.manage',
    competitionId,
    new Date(),
  );
  const row = await db
    .selectFrom('price_calibration_runs')
    .select('payload')
    .where('competition_id', '=', competitionId)
    .where('id', '=', reportId)
    .executeTakeFirst();
  if (!row) throw new CommandRejected('calibration-report-unavailable');
  return priceCalibrationReportSchema.parse(row.payload);
}
