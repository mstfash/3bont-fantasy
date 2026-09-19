import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  catalogueCommandSchema,
  idSchema,
  type CatalogueCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

export function catalogueFingerprint(document: object): string {
  // JSONB does not preserve object-key order. Hash the semantic document.
  return createHash('sha256')
    .update(
      JSON.stringify(document, (_key, value: unknown) => {
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          return Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          );
        return value;
      }),
    )
    .digest('hex');
}
function checkExpected(
  current: object | undefined,
  expected: string | null,
): void {
  if (current ? expected !== catalogueFingerprint(current) : expected !== null)
    throw new CommandRejected('catalogue-changed');
}
export async function executeCatalogueCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: CatalogueCommand,
) {
  const command = catalogueCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
    await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'catalogue-import-coordination'},0))`.execute(
      tx,
    );
    return applyCatalogueCommandWithinTransaction(
      tx,
      principal,
      grants,
      command,
    );
  });
}

/** Internal composition point; callers own the catalogue coordination lock and transaction. */
export async function applyCatalogueCommandWithinTransaction(
  tx: Transaction<Database>,
  principal: Principal,
  grants: readonly StaffGrant[],
  command: CatalogueCommand,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  const fingerprint = catalogueFingerprint(command);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
    tx,
  );
  const receipt = await tx
    .selectFrom('commands')
    .selectAll()
    .where('actor_id', '=', principal.accountId)
    .where('command_id', '=', command.commandId)
    .executeTakeFirst();
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      throw new CommandRejected('idempotency-conflict');
    return z.object({ id: idSchema }).parse(receipt.result);
  }
  const document =
    command.kind === 'season'
      ? command.season
      : command.kind === 'club'
        ? command.club
        : command.footballer;
  const entityId = document.id;
  // An entity lock also serializes concurrent attempts to create the same identifier.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalogue:${command.kind}:${entityId}`},0))`.execute(
    tx,
  );
  let before: object | null;
  if (command.kind === 'season') {
    const current = await tx
      .selectFrom('seasons')
      .select('data')
      .where('id', '=', command.season.id)
      .forUpdate()
      .executeTakeFirst();
    checkExpected(current?.data, command.expectedFingerprint);
    before = current?.data ?? null;
    if (
      Date.parse(command.season.endsAt) <= Date.parse(command.season.startsAt)
    )
      throw new CommandRejected('season-dates-invalid');
    if (current && current.data.synthetic !== command.season.synthetic)
      throw new CommandRejected('synthetic-provenance-frozen');
    await tx
      .insertInto('seasons')
      .values({ id: command.season.id, data: command.season })
      .onConflict((oc) => oc.column('id').doUpdateSet({ data: command.season }))
      .execute();
  } else if (command.kind === 'club') {
    const current = await tx
      .selectFrom('clubs')
      .select('data')
      .where('id', '=', command.club.id)
      .forUpdate()
      .executeTakeFirst();
    checkExpected(current?.data, command.expectedFingerprint);
    before = current?.data ?? null;
    if (current && current.data.seasonId !== command.club.seasonId)
      throw new CommandRejected('season-membership-frozen');
    const season = await tx
      .selectFrom('seasons')
      .select('id')
      .where('id', '=', command.club.seasonId)
      .executeTakeFirst();
    if (!season) throw new CommandRejected('season-unavailable');
    await tx
      .insertInto('clubs')
      .values({
        id: command.club.id,
        season_id: command.club.seasonId,
        data: command.club,
      })
      .onConflict((oc) => oc.column('id').doUpdateSet({ data: command.club }))
      .execute();
  } else {
    const player = command.footballer;
    const current = await tx
      .selectFrom('footballers')
      .select('data')
      .where('id', '=', player.id)
      .forUpdate()
      .executeTakeFirst();
    checkExpected(current?.data, command.expectedFingerprint);
    before = current?.data ?? null;
    if (
      current &&
      (current.data.seasonId !== player.seasonId ||
        current.data.synthetic !== player.synthetic)
    )
      throw new CommandRejected('footballer-identity-frozen');
    const club = await tx
      .selectFrom('clubs')
      .select('id')
      .where('id', '=', player.clubId)
      .where('season_id', '=', player.seasonId)
      .executeTakeFirst();
    if (!club) throw new CommandRejected('club-outside-season');
    const season = await tx
      .selectFrom('seasons')
      .select('data')
      .where('id', '=', player.seasonId)
      .executeTakeFirstOrThrow();
    if (season.data.synthetic !== player.synthetic)
      throw new CommandRejected('synthetic-provenance-mismatch');
    if (
      player.valuation &&
      Date.parse(player.valuation.asOf) > Date.now() + 5 * 60_000
    )
      throw new CommandRejected('valuation-date-in-future');
    await tx
      .insertInto('footballers')
      .values({
        id: player.id,
        season_id: player.seasonId,
        club_id: player.clubId,
        data: player,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({ club_id: player.clubId, data: player }),
      )
      .execute();
  }
  const result = { id: document.id };
  await tx
    .insertInto('commands')
    .values({
      actor_id: principal.accountId,
      command_id: command.commandId,
      fingerprint,
      accepted_at: sql<Date>`clock_timestamp()`,
      result,
    })
    .execute();
  await tx
    .insertInto('audit_events')
    .values({
      id: randomUUID(),
      actor_id: principal.accountId,
      action: `catalogue.${command.kind}.saved`,
      scope_id: document.id,
      reason: command.reason,
      payload: { before, after: document },
    })
    .execute();
  return result;
}
