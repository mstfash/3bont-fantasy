import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  gameweekSchema,
  competitionImpactSchema,
  ruleCategorySchema,
  type Competition,
  type CompetitionUpdate,
  type Gameweek,
} from '@fantasy/contracts';
import { planRuleUpdate } from './rule-update.ts';
import { CommandRejected } from './errors.ts';

/** Both preview and commit lock the competition before its rounds, like entry commands. */
export async function loadCompetitionUpdateBasis(
  tx: Transaction<Database>,
  command: Pick<CompetitionUpdate, 'competitionId' | 'expectedRevision'>,
) {
  const row = await tx
    .selectFrom('competitions')
    .select('data')
    .where('id', '=', command.competitionId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new CommandRejected('competition-unavailable');
  const current = competitionSchema.parse(row.data);
  if (current.revision !== command.expectedRevision)
    throw new CommandRejected('competition-changed');
  if (['completed', 'archived'].includes(current.status))
    throw new CommandRejected('competition-closed');
  const rounds = (
    await tx
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', current.id)
      .orderBy('number')
      .forUpdate()
      .execute()
  ).map((row) => gameweekSchema.parse(row.data));
  return { current, rounds };
}

/** Read-only planning under the caller's competition/round locks. */
export async function planCompetitionUpdate(
  tx: Transaction<Database>,
  current: Competition,
  command: CompetitionUpdate,
  rounds: readonly Gameweek[],
) {
  if (command.rules.pricing.automaticUpdates)
    throw new CommandRejected('pricing-calibration-required');
  const entries = (
    await tx
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', current.id)
      .execute()
  ).map((row) => entrySchema.parse(row.data));
  const owned = new Map<string, number>();
  for (const entry of entries)
    owned.set(entry.accountId, (owned.get(entry.accountId) ?? 0) + 1);
  const maximumOwned = [...owned.values()].reduce(
    (maximum, count) => Math.max(maximum, count),
    0,
  );
  if (maximumOwned > command.entryLimit)
    throw new CommandRejected('entry-limit-below-existing');
  const prices = await tx
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', current.id)
    .execute();
  if (
    prices.some(
      (p) =>
        p.data.price < command.rules.pricing.minimum ||
        p.data.price > command.rules.pricing.maximum,
    )
  )
    throw new CommandRejected('existing-prices-outside-bounds');
  const clock = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!clock) throw new Error('Database clock unavailable');
  const rulePlan = await planRuleUpdate(
    tx,
    current,
    command.rules,
    entries,
    rounds,
    clock,
    command.economicEffectiveGameweekId,
  );
  const competition = competitionSchema.parse({
    ...current,
    name: command.name,
    description: command.description,
    entryLimit: command.entryLimit,
    registrationOpens: command.registrationOpens,
    registrationCloses: command.registrationCloses,
    rules: { ...command.rules, version: rulePlan.version },
    revision: current.revision + 1,
  });
  const impactData = {
    competitionId: current.id,
    revision: current.revision,
    changedCategories: rulePlan.changed,
    metadataChanges: (
      [
        'name',
        'description',
        'entryLimit',
        'registrationOpens',
        'registrationCloses',
      ] as const
    ).filter(
      (key) =>
        JSON.stringify(current[key]) !== JSON.stringify(competition[key]),
    ),
    entries: {
      accounts: owned.size,
      draft: entries.filter((e) => e.status === 'draft').length,
      active: entries.filter((e) => e.status === 'active').length,
      retired: entries.filter((e) => e.status === 'retired').length,
      maximumOwned,
      activeAboveProposedCarryCap: entries.filter(
        (e) =>
          e.status === 'active' &&
          e.state.freeTransfers > command.rules.transfer.carryCap,
      ).length,
    },
    entryLimit: { before: current.entryLimit, after: command.entryLimit },
    economicStart: rulePlan.economicStart,
    noticeRequired: rulePlan.noticeRequired,
    rounds: rounds.map((round) => {
      const update = rulePlan.updates.find((u) => u.gameweekId === round.id);
      return {
        id: round.id,
        number: round.number,
        name: round.name,
        deadline: round.deadline,
        beforeVersion: round.rules.version,
        afterVersion: update?.rules.version ?? round.rules.version,
        changedCategories: update
          ? ruleCategorySchema.options.filter(
              (key) =>
                JSON.stringify(round.rules[key]) !==
                JSON.stringify(update.rules[key]),
            )
          : [],
        disposition: update
          ? 'updated'
          : round.status !== 'upcoming' ||
              Date.parse(round.deadline) <= clock.getTime()
            ? 'locked'
            : rulePlan.changed.length &&
                rulePlan.noticeRequired &&
                Date.parse(round.deadline) < clock.getTime() + 48 * 3600000
              ? 'notice'
              : 'unchanged',
      };
    }),
  };
  // Bind the proposed values and exact per-round rules, not volatile calculation time or command IDs.
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        competition,
        impact: impactData,
        roundRules: rounds.map((r) => ({
          id: r.id,
          before: r.rules,
          after:
            rulePlan.updates.find((u) => u.gameweekId === r.id)?.rules ??
            r.rules,
        })),
      }),
    )
    .digest('hex');
  const impact = competitionImpactSchema.parse({ ...impactData, fingerprint });
  return { competition, rulePlan, impact };
}
