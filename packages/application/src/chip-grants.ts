import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  chipGrantCommandSchema,
  chipGrantSchema,
  chipInventorySchema,
  type ChipGrantCommand,
  type ChipGrant,
} from '@fantasy/contracts';
import { CHIPS, type ChipInventory } from '@fantasy/domain';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function executeChipGrantCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ChipGrantCommand,
): Promise<ChipGrant> {
  const command = chipGrantCommandSchema.parse(input);
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
    const receipt = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return chipGrantSchema.parse(receipt.result);
    }
    const competition = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (
      !competition ||
      !['published', 'running'].includes(competition.data.status)
    )
      throw new CommandRejected('competition-unavailable');
    if (competition.data.revision !== command.expectedRevision)
      throw new CommandRejected('competition-changed');
    const rounds = await tx
      .selectFrom('gameweeks')
      .select(['id', 'number', 'deadline', 'data'])
      .where('competition_id', '=', command.competitionId)
      .orderBy('number')
      .execute();
    const target = rounds.find((r) => r.id === command.gameweekId);
    const preceding = rounds
      .filter((r) => target && r.number < target.number)
      .at(-1);
    if (
      !target ||
      !preceding ||
      target.data.status !== 'upcoming' ||
      preceding.data.status !== 'upcoming'
    )
      throw new CommandRejected('economic-round-already-open');
    const entries = await tx
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', command.competitionId)
      .execute();
    if (
      entries.some((e) => {
        const editing = rounds.find((r) => r.id === e.data.editingGameweekId);
        return !editing || editing.number >= target.number;
      })
    )
      throw new CommandRejected('economic-round-already-open');
    const existing = await tx
      .selectFrom('chip_grants')
      .select('data')
      .where('competition_id', '=', command.competitionId)
      .execute();
    for (const chip of CHIPS) {
      if (
        command.amounts[chip] > 0 &&
        !target.data.rules.enabledChips.includes(chip)
      )
        throw new CommandRejected('grant-chip-disabled');
      const windows = target.data.rules.chipWindows.filter(
        (w) => w.chip === chip,
      );
      if (
        command.amounts[chip] > 0 &&
        windows.length &&
        !windows.some(
          (w) => w.firstRound <= target.number && w.lastRound >= target.number,
        )
      )
        throw new CommandRejected('grant-outside-chip-window');
      const total =
        competition.data.rules.chipInventory[chip] +
        command.amounts[chip] +
        existing.reduce((sum, g) => sum + g.data.amounts[chip], 0);
      if (total > 25) throw new CommandRejected('grant-inventory-limit');
    }
    const clock = await sql<{
      now: Date;
    }>`SELECT clock_timestamp() AS now`.execute(tx);
    const now = clock.rows[0]?.now;
    if (!now || preceding.deadline.getTime() - now.getTime() < 48 * 3600000)
      throw new CommandRejected('economic-rules-need-notice');
    const grant = chipGrantSchema.parse({
      id: randomUUID(),
      competitionId: command.competitionId,
      gameweekId: target.id,
      amounts: command.amounts,
      announcement: command.announcement,
      announcedAt: now.toISOString(),
    });
    await tx
      .insertInto('chip_grants')
      .values({
        id: grant.id,
        competition_id: grant.competitionId,
        gameweek_id: grant.gameweekId,
        data: grant,
      })
      .execute();
    const updated = {
      ...competition.data,
      revision: competition.data.revision + 1,
    };
    await tx
      .updateTable('competitions')
      .set({ data: updated, revision: updated.revision })
      .where('id', '=', updated.id)
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: grant,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'chips.grant-announced',
        scope_id: grant.competitionId,
        reason: command.reason,
        payload: { grant },
      })
      .execute();
    return grant;
  });
}
/** Parent competition lock and entry ownership/rollover transaction are required. */
export async function applyChipGrants(
  tx: Transaction<Database>,
  entryId: string,
  competitionId: string,
  inventory: ChipInventory,
  grants: readonly ChipGrant[],
): Promise<ChipInventory> {
  let result = inventory;
  for (const grant of grants) {
    const applied = await tx
      .insertInto('chip_grant_receipts')
      .values({
        grant_id: grant.id,
        entry_id: entryId,
        competition_id: competitionId,
      })
      .onConflict((oc) => oc.columns(['grant_id', 'entry_id']).doNothing())
      .returning('grant_id')
      .executeTakeFirst();
    if (!applied) continue;
    result = chipInventorySchema.parse(
      CHIPS.reduce(
        (next, chip) => ({ ...next, [chip]: next[chip] + grant.amounts[chip] }),
        { ...result },
      ),
    );
  }
  return result;
}
