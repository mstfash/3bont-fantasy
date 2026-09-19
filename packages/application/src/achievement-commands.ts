import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import {
  achievementCommandSchema,
  achievementCommandResultSchema,
  achievementDefinitionSchema,
  type AchievementCommand,
  type AchievementDefinition,
} from '@fantasy/contracts';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import { reconcileAchievementsWithinTransaction } from './achievement-reconciliation.ts';
async function protectEarnedWindow(
  tx: Transaction<Database>,
  definition: AchievementDefinition,
  throughRound: number,
): Promise<void> {
  if (
    definition.condition.kind !== 'activated' ||
    throughRound >= definition.activeUntilRound
  )
    return;
  const earned = await tx
    .selectFrom('achievement_grants')
    .innerJoin('entries', (join) =>
      join.onRef(
        'entries.id',
        '=',
        sql<string>`(achievement_grants.data->>'witnessEntryId')::uuid`,
      ),
    )
    .innerJoin('gameweeks', (join) =>
      join.onRef(
        'gameweeks.id',
        '=',
        sql<string>`(entries.data->>'firstGameweekId')::uuid`,
      ),
    )
    .select('achievement_grants.id')
    .where('definition_id', '=', definition.id)
    .where('version', '=', definition.version)
    .where(sql<string>`achievement_grants.data->>'state'`, '=', 'active')
    .where('gameweeks.number', '>', throughRound)
    .executeTakeFirst();
  if (earned) throw new CommandRejected('achievement-window-has-earned-grants');
}
export async function executeAchievementCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: AchievementCommand,
) {
  const command = achievementCommandSchema.parse(input);
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
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return achievementCommandResultSchema.parse(cached.result);
    }
    const competition = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!competition || competition.data.status === 'archived')
      throw new CommandRejected('competition-unavailable');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    let definition: AchievementDefinition | null = null;
    if (command.kind !== 'reconcile') {
      const versions =
        'definitionId' in command
          ? (
              await tx
                .selectFrom('achievement_definitions')
                .select('data')
                .where('id', '=', command.definitionId)
                .where('competition_id', '=', command.competitionId)
                .orderBy('version')
                .execute()
            ).map((d) => d.data)
          : [];
      const current =
        'version' in command
          ? versions.find((d) => d.version === command.version)
          : command.kind === 'revise'
            ? versions.find((d) => d.version === command.sourceVersion)
            : null;
      if (command.kind !== 'create' && !current)
        throw new CommandRejected('achievement-unavailable');
      if (
        'expectedRevision' in command &&
        current?.revision !== command.expectedRevision
      )
        throw new CommandRejected('achievement-changed');
      if (
        command.kind === 'create' ||
        command.kind === 'update' ||
        command.kind === 'revise'
      ) {
        if (command.kind === 'update' && current?.state !== 'draft')
          throw new CommandRejected('achievement-definition-frozen');
        if (
          command.kind === 'revise' &&
          (current?.state !== 'published' ||
            versions.at(-1)?.version !== command.sourceVersion)
        )
          throw new CommandRejected('achievement-use-latest-version');
        definition = achievementDefinitionSchema.parse({
          id: current?.id ?? randomUUID(),
          competitionId: command.competitionId,
          version:
            command.kind === 'revise'
              ? (current?.version ?? 0) + 1
              : (current?.version ?? 1),
          revision:
            command.kind === 'update' ? (current?.revision ?? 0) + 1 : 1,
          name: command.name,
          description: command.description,
          icon: command.icon,
          scope: command.scope,
          condition: command.condition,
          firstRound: command.firstRound,
          lastRound: command.lastRound,
          state: 'draft',
          publishedAt: null,
          activeUntilRound: command.lastRound,
        });
      } else {
        if (!current) throw new CommandRejected('achievement-unavailable');
        const rounds = (
          await tx
            .selectFrom('gameweeks')
            .select('data')
            .where('competition_id', '=', command.competitionId)
            .orderBy('number')
            .execute()
        ).map((r) => r.data);
        const lockedMax = Math.max(
          0,
          ...rounds
            .filter(
              (r) =>
                r.status !== 'upcoming' ||
                Date.parse(r.deadline) <= now.getTime(),
            )
            .map((r) => r.number),
        );
        if (command.kind === 'publish') {
          if (current.state !== 'draft' || competition.data.status === 'draft')
            throw new CommandRejected('achievement-publication-unavailable');
          if (
            !rounds.some(
              (r) =>
                r.number >= current.firstRound && r.number <= current.lastRound,
            )
          )
            throw new CommandRejected('achievement-window-unavailable');
          if (
            current.firstRound <= lockedMax &&
            (!command.allowHistorical || current.version > 1)
          )
            throw new CommandRejected(
              'achievement-historical-confirmation-required',
            );
          const previous = versions
            .filter((d) => d.version < current.version)
            .at(-1);
          if (previous) {
            if (
              previous.state !== 'published' ||
              current.firstRound <= previous.firstRound ||
              current.firstRound <= lockedMax
            )
              throw new CommandRejected('achievement-version-must-be-future');
            await protectEarnedWindow(tx, previous, current.firstRound - 1);
            const narrowed = achievementDefinitionSchema.parse({
              ...previous,
              activeUntilRound: Math.min(
                previous.activeUntilRound,
                current.firstRound - 1,
              ),
              revision: previous.revision + 1,
            });
            await tx
              .updateTable('achievement_definitions')
              .set({ data: narrowed, revision: narrowed.revision })
              .where('id', '=', previous.id)
              .where('version', '=', previous.version)
              .execute();
            await tx
              .insertInto('audit_events')
              .values({
                id: randomUUID(),
                actor_id: principal.accountId,
                action: 'achievement.version-window',
                scope_id: command.competitionId,
                reason: command.reason,
                payload: { before: previous, after: narrowed },
              })
              .execute();
          }
          definition = achievementDefinitionSchema.parse({
            ...current,
            state: 'published',
            publishedAt: now.toISOString(),
            revision: current.revision + 1,
          });
        } else {
          if (
            current.state !== 'published' ||
            command.afterRound < lockedMax ||
            command.afterRound >= current.activeUntilRound
          )
            throw new CommandRejected('achievement-retirement-must-be-future');
          await protectEarnedWindow(tx, current, command.afterRound);
          definition = achievementDefinitionSchema.parse({
            ...current,
            activeUntilRound: command.afterRound,
            revision: current.revision + 1,
          });
        }
      }
      const record = definition;
      await tx
        .insertInto('achievement_definitions')
        .values({
          id: definition.id,
          version: definition.version,
          competition_id: definition.competitionId,
          revision: definition.revision,
          data: definition,
        })
        .onConflict((oc) =>
          oc
            .columns(['id', 'version'])
            .doUpdateSet({ revision: record.revision, data: record }),
        )
        .execute();
    }
    const changed =
      command.kind === 'reconcile' ||
      command.kind === 'publish' ||
      command.kind === 'retire'
        ? await reconcileAchievementsWithinTransaction(
            tx,
            command.competitionId,
            principal.accountId,
            command.reason,
          )
        : 0;
    const result = {
      definitionId: definition?.id ?? null,
      version: definition?.version ?? null,
      changed,
    };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `achievement.${command.kind}`,
        scope_id: command.competitionId,
        reason: command.reason,
        payload: { definition, changed },
      })
      .execute();
    return result;
  });
}
