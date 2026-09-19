import {
  planCompetitionUpdate,
  loadCompetitionUpdateBasis,
} from './competition-update-plan.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import type { planRuleUpdate } from './rule-update.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { assessPlayerPool } from '@fantasy/domain';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionCommandSchema,
  competitionSchema,
  type Competition,
  type CompetitionCommand,
  type CompetitionImpact,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

export async function executeCompetitionCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: CompetitionCommand,
) {
  const command = competitionCommandSchema.parse(input);
  if (command.kind !== 'publish' && command.rules.pricing.automaticUpdates)
    throw new CommandRejected('pricing-calibration-required');
  requireCapability(
    principal,
    grants,
    'competition.manage',
    command.kind === 'create' ? null : command.competitionId,
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
      command.kind === 'create' ? null : command.competitionId,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    const previous = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return competitionSchema.parse(previous.result);
    }
    let competition: Competition;
    let impact: CompetitionImpact | null = null;
    let rulePlan: Awaited<ReturnType<typeof planRuleUpdate>> | null = null;
    if (command.kind === 'create') {
      const season = await tx
        .selectFrom('seasons')
        .select('id')
        .where('id', '=', command.seasonId)
        .executeTakeFirst();
      if (!season) throw new CommandRejected('season-unavailable');
      const duplicate = await tx
        .selectFrom('competitions')
        .select('id')
        .where('slug', '=', command.slug)
        .executeTakeFirst();
      if (duplicate) throw new CommandRejected('slug-unavailable');
      // Project the command explicitly: transport fields never enter a strict domain document.
      competition = competitionSchema.parse({
        id: randomUUID(),
        seasonId: command.seasonId,
        slug: command.slug,
        name: command.name,
        description: command.description,
        entryLimit: command.entryLimit,
        registrationOpens: command.registrationOpens,
        registrationCloses: command.registrationCloses,
        rules: { ...command.rules, version: 1 },
        status: 'draft',
        firstLockedAt: null,
        revision: 1,
      });
      await tx
        .insertInto('competitions')
        .values({
          id: competition.id,
          season_id: competition.seasonId,
          slug: competition.slug,
          revision: 1,
          data: competition,
        })
        .execute();
    } else {
      const { current, rounds } = await loadCompetitionUpdateBasis(tx, command);
      const clock = (
        await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
      ).rows[0]?.now;
      if (!clock) throw new Error('Database clock unavailable');
      if (command.kind === 'publish') {
        if (current.status !== 'draft')
          throw new CommandRejected('already-published');
        const next = rounds.find(
          (r) =>
            r.status === 'upcoming' && Date.parse(r.deadline) > clock.getTime(),
        );
        const pool = await tx
          .selectFrom('competition_players')
          .innerJoin(
            'footballers',
            'footballers.id',
            'competition_players.footballer_id',
          )
          .select(['competition_players.data as player', 'footballers.club_id'])
          .where('competition_players.competition_id', '=', current.id)
          .execute();
        if (!next)
          throw new CommandRejected('publication-needs-rounds-and-player-pool');
        const readiness = assessPlayerPool(
          pool
            .filter((p) => p.player.selectable)
            .map((p) => ({
              footballerId: p.player.footballerId,
              clubId: p.club_id,
              position: p.player.position,
              price: p.player.price,
            })),
          current.rules.squad,
        );
        if (!readiness.ready)
          throw new CommandRejected(`player-pool-${readiness.reason}`);
        competition = {
          ...current,
          status: 'published' as const,
          revision: current.revision + 1,
        };
      } else {
        const planned = await planCompetitionUpdate(
          tx,
          current,
          command,
          rounds,
        );
        if (!command.expectedImpactFingerprint)
          throw new CommandRejected('competition-impact-required');
        if (command.expectedImpactFingerprint !== planned.impact.fingerprint)
          throw new CommandRejected('competition-impact-changed');
        rulePlan = planned.rulePlan;
        competition = planned.competition;
        impact = planned.impact;
        for (const update of rulePlan.updates) {
          const round = rounds.find((r) => r.id === update.gameweekId);
          if (!round) throw new Error('Planned gameweek unavailable');
          await tx
            .updateTable('gameweeks')
            .set({ data: { ...round, rules: update.rules } })
            .where('id', '=', round.id)
            .execute();
        }
      }
      await tx
        .updateTable('competitions')
        .set({ revision: competition.revision, data: competition })
        .where('id', '=', competition.id)
        .execute();
    }
    const now = sql<Date>`clock_timestamp()`;
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result: competition,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `competition.${command.kind}`,
        scope_id: competition.id,
        reason: command.reason,
        payload: {
          revision: competition.revision,
          rulesVersion: competition.rules.version,
          rulePlan,
          impact,
        },
      })
      .execute();
    return competition;
  });
}
