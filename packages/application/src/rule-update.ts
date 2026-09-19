import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  competitionRulesSchema,
  ruleCategorySchema,
  type Competition,
  type CompetitionRules,
  type Entry,
  type Gameweek,
} from '@fantasy/contracts';
import {
  CHIPS,
  assessPlayerPool,
  validateRoster,
  EntryRuleError,
} from '@fantasy/domain';
import { CommandRejected } from './errors.ts';
const categories = ruleCategorySchema.options;
const economicCategories = new Set<string>([
  'transfer',
  'enabledChips',
  'chipWindows',
]);
function economics(rules: CompetitionRules): string {
  return JSON.stringify({
    transfer: rules.transfer,
    enabledChips: rules.enabledChips,
    chipWindows: rules.chipWindows,
  });
}
/** Build the exact per-round changes while the parent competition and its rounds are locked. */
export async function planRuleUpdate(
  tx: Transaction<Database>,
  current: Competition,
  requested: CompetitionRules,
  entries: readonly Entry[],
  rounds: readonly Gameweek[],
  now: Date,
  effectiveGameweekId?: string,
) {
  const changed = categories.filter(
    (key) =>
      JSON.stringify(current.rules[key]) !== JSON.stringify(requested[key]),
  );
  const activated = entries.filter((e) => e.status !== 'draft');
  const structural = changed.includes('squad') || changed.includes('ranking');
  if (structural) {
    if (
      current.firstLockedAt !== null ||
      rounds.some(
        (r) =>
          r.status !== 'upcoming' || Date.parse(r.deadline) <= now.getTime(),
      )
    )
      throw new CommandRejected('structural-rules-frozen');
    if (
      activated.length &&
      current.rules.squad.startingBudget !== requested.squad.startingBudget
    )
      throw new CommandRejected('starting-budget-already-allocated');
    const market = await tx
      .selectFrom('competition_players')
      .innerJoin(
        'footballers',
        'footballers.id',
        'competition_players.footballer_id',
      )
      .select([
        'competition_players.data as pool',
        'footballers.data as player',
      ])
      .where('competition_players.competition_id', '=', current.id)
      .forShare('footballers')
      .execute();
    const players = market.map((p) => ({
      footballerId: p.player.id,
      clubId: p.player.clubId,
      position: p.pool.position,
      price: p.pool.price,
    }));
    try {
      for (const entry of entries) {
        validateRoster(entry.state.roster, players, requested.squad);
        if (entry.state.permanentBaseline)
          validateRoster(
            entry.state.permanentBaseline,
            players,
            requested.squad,
          );
        if (entry.state.beforeFreeHit)
          validateRoster(
            entry.state.beforeFreeHit.roster,
            players,
            requested.squad,
          );
      }
    } catch (error) {
      if (error instanceof EntryRuleError)
        throw new CommandRejected('structural-change-invalidates-entry');
      throw error;
    }
    if (current.status !== 'draft') {
      const readiness = assessPlayerPool(
        market
          .filter((p) => p.pool.selectable)
          .map((p) => ({
            footballerId: p.player.id,
            clubId: p.player.clubId,
            position: p.pool.position,
            price: p.pool.price,
          })),
        requested.squad,
      );
      if (!readiness.ready)
        throw new CommandRejected(`player-pool-${readiness.reason}`);
    }
  }
  if (activated.length && changed.includes('chipInventory'))
    throw new CommandRejected('chip-inventory-needs-equal-grant');
  if (activated.length && changed.includes('chipWindows'))
    throw new CommandRejected('chip-windows-frozen');
  const economicChange = changed.some((key) => economicCategories.has(key));
  const future = rounds.filter(
    (r) => r.status === 'upcoming' && Date.parse(r.deadline) > now.getTime(),
  );
  let economicStart: number | null = null;
  if (economicChange && activated.length) {
    const target = future.find((r) => r.id === effectiveGameweekId);
    if (!target) throw new CommandRejected('economic-rules-need-future-round');
    const preceding = rounds.filter((r) => r.number < target.number).at(-1);
    if (
      !preceding ||
      Date.parse(preceding.deadline) <= now.getTime() ||
      entries.some((e) => {
        const editing = rounds.find((r) => r.id === e.editingGameweekId);
        if (!editing) throw new CommandRejected('entry-gameweek-unavailable');
        return editing.number >= target.number;
      })
    )
      throw new CommandRejected('economic-round-already-open');
    if (Date.parse(preceding.deadline) - now.getTime() < 48 * 3600000)
      throw new CommandRejected('economic-rules-need-notice');
    let latestTransition = 0;
    for (let i = 1; i < future.length; i++) {
      const previous = future[i - 1],
        round = future[i];
      if (
        previous &&
        round &&
        economics(previous.rules) !== economics(round.rules)
      )
        latestTransition = round.number;
    }
    if (target.number < latestTransition)
      throw new CommandRejected('economic-rules-must-follow-scheduled-changes');
    economicStart = target.number;
  }
  const version = changed.length
    ? Math.max(current.rules.version, ...rounds.map((r) => r.rules.version)) + 1
    : current.rules.version;
  const noticeBoundary = now.getTime() + 48 * 3600000;
  if (
    structural &&
    activated.length &&
    future.some((round) => Date.parse(round.deadline) < noticeBoundary)
  )
    throw new CommandRejected('structural-rules-need-notice');
  const updates = future.flatMap((round) => {
    if (activated.length && Date.parse(round.deadline) < noticeBoundary)
      return [];
    const keys = changed.filter(
      (key) =>
        !economicCategories.has(key) ||
        economicStart === null ||
        round.number >= economicStart,
    );
    if (keys.length === 0) return [];
    const rules = competitionRulesSchema.parse(
      keys.reduce((result, key) => ({ ...result, [key]: requested[key] }), {
        ...round.rules,
        version,
      }),
    );
    return [{ gameweekId: round.id, before: round.rules, rules }];
  });
  if (changed.length && activated.length && updates.length === 0)
    throw new CommandRejected('rules-need-future-notice');
  const grants = await tx
    .selectFrom('chip_grants')
    .select('data')
    .where('competition_id', '=', current.id)
    .execute();
  if (changed.includes('chipInventory'))
    for (const chip of CHIPS) {
      if (
        requested.chipInventory[chip] +
          grants.reduce((sum, g) => sum + g.data.amounts[chip], 0) >
        25
      )
        throw new CommandRejected('grant-inventory-limit');
    }
  for (const update of updates)
    for (const { data: grant } of grants.filter(
      (g) => g.data.gameweekId === update.gameweekId,
    )) {
      if (
        CHIPS.some(
          (chip) =>
            grant.amounts[chip] > 0 &&
            (!update.rules.enabledChips.includes(chip) ||
              (update.rules.chipWindows.some((w) => w.chip === chip) &&
                !update.rules.chipWindows.some(
                  (w) =>
                    w.chip === chip &&
                    w.firstRound <=
                      (rounds.find((r) => r.id === update.gameweekId)?.number ??
                        0) &&
                    w.lastRound >=
                      (rounds.find((r) => r.id === update.gameweekId)?.number ??
                        0),
                ))),
        )
      )
        throw new CommandRejected('announced-grant-protected');
    }
  // Structural edits cannot cross the first lock while validating a large player pool.
  if (structural) {
    const elapsed = await tx
      .selectFrom('gameweeks')
      .select('id')
      .where('competition_id', '=', current.id)
      .where('deadline', '<=', sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    if (elapsed) throw new CommandRejected('structural-rules-frozen');
  }
  // Slow validation must not consume a deadline or the promised notice period.
  const checkedAt = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!checkedAt) throw new Error('Database clock unavailable');
  const notice = activated.length ? 48 * 3600000 : 0;
  const affectedDeadlines = updates.map(
    (update) =>
      rounds.find((round) => round.id === update.gameweekId)?.deadline,
  );
  if (economicStart !== null)
    affectedDeadlines.push(
      rounds.filter((round) => round.number < economicStart).at(-1)?.deadline,
    );
  if (
    affectedDeadlines.some(
      (deadline) =>
        !deadline ||
        Date.parse(deadline) <= checkedAt.getTime() ||
        Date.parse(deadline) < checkedAt.getTime() + notice,
    )
  )
    throw new CommandRejected('competition-impact-changed');
  return {
    changed,
    version,
    economicStart,
    updates,
    announcedAt: now.toISOString(),
    noticeRequired: activated.length > 0,
  };
}
