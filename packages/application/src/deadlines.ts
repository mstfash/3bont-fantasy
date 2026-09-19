import { applyChipGrants } from './chip-grants.ts';
import {
  competitionSchema,
  entrySchema,
  gameweekSchema,
} from '@fantasy/contracts';
import { lockAndAdvance } from '@fantasy/domain';
import type { createDatabase } from '@fantasy/persistence';
import { sql } from 'kysely';

export interface DeadlineRun {
  readonly inspected: number;
  readonly locked: number;
  readonly entries: number;
}

/** Worker-only use case. Discovery is repeated each tick; the transaction makes each round idempotent. */
export async function advanceDueGameweeks(
  db: ReturnType<typeof createDatabase>,
  competitionId?: string,
): Promise<DeadlineRun> {
  let discovery = db
    .selectFrom('gameweeks')
    .select(['id', 'competition_id'])
    .where('deadline', '<=', sql<Date>`clock_timestamp()`)
    .where(sql<string>`data->>'status'`, '=', 'upcoming')
    .orderBy('deadline')
    .limit(50);
  if (competitionId)
    discovery = discovery.where('competition_id', '=', competitionId);
  const due = await discovery.execute();
  let lockedCount = 0;
  let entryCount = 0;
  for (const candidate of due) {
    const result = await db.transaction().execute(async (transaction) => {
      // All competition-changing commands must use this same parent-first lock order.
      const competitionRow = await transaction
        .selectFrom('competitions')
        .selectAll()
        .where('id', '=', candidate.competition_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const competition = competitionSchema.parse(competitionRow.data);
      if (!['published', 'running'].includes(competition.status)) return null;
      const row = await transaction
        .selectFrom('gameweeks')
        .selectAll()
        .where('id', '=', candidate.id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const gameweek = gameweekSchema.parse(row.data);
      const clock = await sql<{
        now: Date;
      }>`SELECT clock_timestamp() AS now`.execute(transaction);
      const now = clock.rows[0]?.now;
      if (
        !now ||
        gameweek.status !== 'upcoming' ||
        Date.parse(gameweek.deadline) > now.getTime()
      )
        return null;
      const next = await transaction
        .selectFrom('gameweeks')
        .select(['id', 'data'])
        .where('competition_id', '=', competition.id)
        .where('number', '>', gameweek.number)
        .orderBy('number')
        .executeTakeFirst();
      const frozenPool = await transaction
        .selectFrom('competition_players')
        .select('data')
        .where('competition_id', '=', competition.id)
        .execute();
      await transaction
        .insertInto('gameweek_player_pools')
        .values({
          gameweek_id: gameweek.id,
          payload: { players: frozenPool.map((p) => p.data) },
        })
        .execute();
      const entries = await transaction
        .selectFrom('entries')
        .selectAll()
        .where('competition_id', '=', competition.id)
        .forUpdate()
        .execute();
      const grants = next
        ? await transaction
            .selectFrom('chip_grants')
            .select('data')
            .where('gameweek_id', '=', next.id)
            .execute()
        : [];
      const retirements = new Map(
        (
          await transaction
            .selectFrom('entry_retirements')
            .select(['entry_id', 'retired_at'])
            .where('competition_id', '=', competition.id)
            .execute()
        ).map((r) => [r.entry_id, r.retired_at]),
      );
      let count = 0;
      for (const entryRow of entries) {
        const entry = entrySchema.parse(entryRow.data);
        const retiredAt = retirements.get(entry.id);
        const participated =
          entry.status === 'active' ||
          (entry.status === 'retired' &&
            retiredAt !== undefined &&
            Date.parse(gameweek.deadline) <= retiredAt.getTime());
        if (!participated || entry.editingGameweekId !== gameweek.id) continue;
        const transition = lockAndAdvance(
          entry.state,
          gameweek.rules.transfer,
          next
            ? gameweekSchema.parse(next.data).rules.transfer
            : gameweek.rules.transfer,
        );
        await transaction
          .insertInto('entry_snapshots')
          .values({
            entry_id: entry.id,
            competition_id: competition.id,
            gameweek_id: gameweek.id,
            locked_at: gameweek.deadline,
            payload: transition.locked,
          })
          .execute();
        const updated = entrySchema.parse({
          ...entry,
          revision: entry.revision + 1,
          editingGameweekId: next?.id ?? gameweek.id,
          state: {
            ...transition.editing,
            inventory: await applyChipGrants(
              transaction,
              entry.id,
              competition.id,
              transition.editing.inventory,
              entry.status === 'active' ? grants.map((g) => g.data) : [],
            ),
          },
        });
        await transaction
          .updateTable('entries')
          .set({ revision: updated.revision, data: updated })
          .where('id', '=', entry.id)
          .execute();
        count++;
      }
      await transaction
        .updateTable('gameweeks')
        .set({ data: { ...gameweek, status: 'locked' } })
        .where('id', '=', gameweek.id)
        .execute();
      if (competition.firstLockedAt === null) {
        const updated = competitionSchema.parse({
          ...competition,
          status: 'running',
          firstLockedAt: gameweek.deadline,
          revision: competition.revision + 1,
        });
        await transaction
          .updateTable('competitions')
          .set({ data: updated, revision: updated.revision })
          .where('id', '=', competition.id)
          .execute();
      }
      return count;
    });
    if (result !== null) {
      lockedCount++;
      entryCount += result;
    }
  }
  return { inspected: due.length, locked: lockedCount, entries: entryCount };
}
