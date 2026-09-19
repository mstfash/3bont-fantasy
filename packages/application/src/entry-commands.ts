import { applyChipGrants } from './chip-grants.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionSchema,
  entryCommandSchema,
  entrySchema,
  gameweekSchema,
  poolPlayerSchema,
  footballerSchema,
  type Entry,
  type EntryCommand,
} from '@fantasy/contracts';
import {
  activateChip,
  buildEntry,
  cancelChip,
  transferBatch,
  validateRoster,
  type SelectedFootballer,
} from '@fantasy/domain';
import {
  AccessDenied,
  requireEntryOwner,
  type Principal,
} from './authorization.ts';

import { CommandRejected } from './errors.ts';
export { CommandRejected } from './errors.ts';

/** Serialized with deadline/rule/price changes. The retry key is bound to the full parsed command. */
export async function executeEntryCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  input: EntryCommand,
): Promise<Entry> {
  if (!principal.emailVerified) throw new AccessDenied();
  const command = entryCommandSchema.parse(input);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const existingCommand = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (existingCommand) {
      if (existingCommand.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return entrySchema.parse(existingCommand.result);
    }
    const competitionRow = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!competitionRow) throw new CommandRejected('competition-unavailable');
    const competition = competitionSchema.parse(competitionRow.data);
    if (!['published', 'running'].includes(competition.status))
      throw new CommandRejected('competition-unavailable');
    const account = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!account) throw new AccessDenied();
    const gameweekRow = await tx
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', command.gameweekId)
      .where('competition_id', '=', competition.id)
      .forUpdate()
      .executeTakeFirst();
    if (!gameweekRow) throw new CommandRejected('gameweek-unavailable');
    const gameweek = gameweekSchema.parse(gameweekRow.data);
    if (gameweek.status !== 'upcoming')
      throw new CommandRejected('deadline-passed');
    const poolRows = await tx
      .selectFrom('competition_players')
      .innerJoin(
        'footballers',
        'footballers.id',
        'competition_players.footballer_id',
      )
      .select([
        'competition_players.data as pool',
        'footballers.data as footballer',
      ])
      .where('competition_players.competition_id', '=', competition.id)
      .forShare('footballers')
      .execute();
    const pool = poolRows.map((row) => ({
      pool: poolPlayerSchema.parse(row.pool),
      footballer: footballerSchema.parse(row.footballer),
    }));
    const players: SelectedFootballer[] = pool.map((p) => ({
      footballerId: p.pool.footballerId,
      clubId: p.footballer.clubId,
      position: p.pool.position,
      price: p.pool.price,
    }));
    function checkQuotes(
      quotes: readonly { footballerId: string; priceRevision: number }[],
      requiredIds: readonly string[],
    ): void {
      if (
        new Set(quotes.map((q) => q.footballerId)).size !== quotes.length ||
        quotes.length !== new Set(requiredIds).size
      )
        throw new CommandRejected('invalid-price-quotes');
      for (const id of requiredIds) {
        const quote = quotes.find((q) => q.footballerId === id);
        const current = pool.find((p) => p.pool.footballerId === id);
        if (
          !quote ||
          !current ||
          quote.priceRevision !== current.pool.priceRevision
        )
          throw new CommandRejected('price-changed');
      }
    }
    function checkSelectable(ids: readonly string[]): void {
      if (
        ids.some(
          (id) =>
            !pool.find((p) => p.pool.footballerId === id)?.pool.selectable,
        )
      )
        throw new CommandRejected('footballer-unavailable');
    }
    let entry: Entry;
    if (command.kind === 'create') {
      const earlier = await tx
        .selectFrom('gameweeks')
        .select('id')
        .where('competition_id', '=', competition.id)
        .where('number', '<', gameweek.number)
        .where('deadline', '>', sql<Date>`clock_timestamp()`)
        .where(sql<string>`data->>'status'`, '=', 'upcoming')
        .executeTakeFirst();
      if (earlier) throw new CommandRejected('use-next-unlocked-gameweek');
      const owned = await tx
        .selectFrom('entries')
        .select('data')
        .where('competition_id', '=', competition.id)
        .where('account_id', '=', principal.accountId)
        .execute();
      if (owned.length >= competition.entryLimit)
        throw new CommandRejected('entry-limit');
      const ids = command.players.map((p) => p.footballerId);
      checkQuotes(command.players, ids);
      checkSelectable(ids);
      const selected = ids.map((id) => {
        const player = players.find((p) => p.footballerId === id);
        if (!player) throw new CommandRejected('footballer-unavailable');
        return player;
      });
      entry = entrySchema.parse({
        id: randomUUID(),
        competitionId: competition.id,
        accountId: principal.accountId,
        name: command.name,
        status: 'active',
        activatedAt: new Date().toISOString(),
        firstGameweekId: gameweek.id,
        editingGameweekId: gameweek.id,
        state: buildEntry(
          { players: selected, ...command.lineup },
          gameweek.rules.squad,
          gameweek.rules.chipInventory,
        ),
        revision: 1,
      });
    } else {
      const row = await tx
        .selectFrom('entries')
        .select('data')
        .where('id', '=', command.entryId)
        .where('competition_id', '=', competition.id)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new AccessDenied();
      entry = entrySchema.parse(row.data);
      requireEntryOwner(principal, entry.accountId);
      if (entry.revision !== command.expectedRevision)
        throw new CommandRejected('entry-changed');
      if (entry.status !== 'active' || entry.editingGameweekId !== gameweek.id)
        throw new CommandRejected('gameweek-unavailable');
      let state = entry.state;
      if (command.kind === 'lineup') {
        const roster = { ...entry.state.roster, ...command.lineup };
        // Real-world club transfers grandfather existing holdings until a fantasy transfer batch.
        validateRoster(roster, players, {
          ...gameweek.rules.squad,
          clubCap: gameweek.rules.squad.squadSize,
        });
        state = { ...state, roster };
      } else if (command.kind === 'transfer') {
        checkQuotes(
          command.quotes,
          command.transfers.flatMap((t) => [t.out, t.in]),
        );
        checkSelectable(command.transfers.map((t) => t.in));
        state = entrySchema.shape.state.parse(
          transferBatch(
            state,
            command.transfers,
            command.lineup,
            players,
            gameweek.rules.squad,
            gameweek.rules.transfer,
          ),
        );
      } else {
        const available = gameweek.rules.enabledChips.filter((chip) => {
          const windows = gameweek.rules.chipWindows.filter(
            (window) => window.chip === chip,
          );
          return (
            windows.length === 0 ||
            windows.some(
              (w) =>
                w.firstRound <= gameweek.number &&
                w.lastRound >= gameweek.number,
            )
          );
        });
        state = entrySchema.shape.state.parse(
          command.chip === null
            ? cancelChip(state)
            : activateChip(state, command.chip, available),
        );
      }
      entry = entrySchema.parse({
        ...entry,
        state,
        revision: entry.revision + 1,
      });
    }
    // Authoritative acceptance AFTER all potentially waiting locks and validation.
    const clock = await sql<{
      now: Date;
    }>`SELECT clock_timestamp() AS now`.execute(tx);
    const now = clock.rows[0]?.now;
    if (!now || now.getTime() >= Date.parse(gameweek.deadline))
      throw new CommandRejected('deadline-passed');
    if (
      account.closed_at !== null ||
      (account.suspended_until && account.suspended_until > now)
    )
      throw new AccessDenied();
    if (command.kind === 'create') {
      if (
        now.getTime() < Date.parse(competition.registrationOpens) ||
        now.getTime() >= Date.parse(competition.registrationCloses)
      )
        throw new CommandRejected('registration-closed');
      entry = { ...entry, activatedAt: now.toISOString() };
      await tx
        .insertInto('entries')
        .values({
          id: entry.id,
          competition_id: competition.id,
          account_id: principal.accountId,
          revision: entry.revision,
          data: entry,
        })
        .execute();
      const grants = await tx
        .selectFrom('chip_grants')
        .select('data')
        .where('gameweek_id', '=', gameweek.id)
        .execute();
      if (grants.length) {
        const inventory = await applyChipGrants(
          tx,
          entry.id,
          competition.id,
          entry.state.inventory,
          grants.map((g) => g.data),
        );
        entry = entrySchema.parse({
          ...entry,
          state: { ...entry.state, inventory },
        });
        await tx
          .updateTable('entries')
          .set({ data: entry })
          .where('id', '=', entry.id)
          .execute();
      }
    } else
      await tx
        .updateTable('entries')
        .set({ revision: entry.revision, data: entry })
        .where('id', '=', entry.id)
        .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: entry,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `entry.${command.kind}`,
        scope_id: entry.id,
        reason: null,
        payload: {
          commandId: command.commandId,
          revision: entry.revision,
          gameweekId: gameweek.id,
        },
      })
      .execute();
    return entry;
  });
}
