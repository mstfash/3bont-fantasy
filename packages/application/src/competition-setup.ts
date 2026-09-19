import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { reviewInitialPricePublication } from './initial-price-publication.ts';
import { protectRuleNotice } from './rule-notice.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  fixtureSchema,
  gameweekSchema,
  poolPlayerSchema,
  setupCommandSchema,
  type SetupCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

export async function executeSetupCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: SetupCommand,
) {
  const command = setupCommandSchema.parse(input);
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
      return competitionSchema.parse(cached.result);
    }
    const row = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new CommandRejected('competition-unavailable');
    const competition = competitionSchema.parse(row.data);
    if (competition.revision !== command.expectedRevision)
      throw new CommandRejected('competition-changed');
    if (['completed', 'archived'].includes(competition.status))
      throw new CommandRejected('competition-closed');
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    let acceptanceCutoff: Date | null = null;
    let initialPriceEvidence: ReturnType<typeof reviewInitialPricePublication> =
      null;
    if (command.kind === 'pool') {
      if (
        new Set(command.players.map((p) => p.footballerId)).size !==
        command.players.length
      )
        throw new CommandRejected('duplicate-footballer');
      const footballers = await tx
        .selectFrom('footballers')
        .select(['id', 'data'])
        .where('season_id', '=', competition.seasonId)
        .orderBy('id')
        .forShare()
        .execute();
      const sourceNow = command.initialPriceReview
        ? (
            await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(
              tx,
            )
          ).rows[0]?.now
        : now;
      if (!sourceNow) throw new Error('Database clock unavailable');
      initialPriceEvidence = reviewInitialPricePublication(
        competition,
        footballers.map((p) => p.data),
        command,
        sourceNow,
      );
      const ids = new Set(footballers.map((p) => p.id));
      const current = (
        await tx
          .selectFrom('competition_players')
          .select('data')
          .where('competition_id', '=', competition.id)
          .execute()
      ).map((p) => poolPlayerSchema.parse(p.data));
      const elapsedRound =
        competition.status === 'draft'
          ? undefined
          : await tx
              .selectFrom('gameweeks')
              .select('id')
              .where('competition_id', '=', competition.id)
              .where('deadline', '<=', now)
              .executeTakeFirst();
      const structureLocked =
        competition.firstLockedAt !== null || elapsedRound !== undefined;
      const nextDeadline = await tx
        .selectFrom('gameweeks')
        .select(['deadline', 'data'])
        .where('competition_id', '=', competition.id)
        .where('deadline', '>', now)
        .where(sql<string>`data->>'status'`, '=', 'upcoming')
        .orderBy('deadline')
        .executeTakeFirst();
      const currentPricing = nextDeadline
        ? gameweekSchema.parse(nextDeadline.data).rules.pricing
        : competition.rules.pricing;
      for (const update of command.players) {
        if (
          update.price < competition.rules.pricing.minimum ||
          update.price > competition.rules.pricing.maximum ||
          update.price < currentPricing.minimum ||
          update.price > currentPricing.maximum
        )
          throw new CommandRejected('price-outside-bounds');
        if (!ids.has(update.footballerId))
          throw new CommandRejected('footballer-outside-season');
        const previous = current.find(
          (p) => p.footballerId === update.footballerId,
        );
        if (
          previous &&
          previous.position !== update.position &&
          structureLocked
        )
          throw new CommandRejected('fantasy-position-frozen');
        if (previous && previous.position !== update.position) {
          const owned = await tx
            .selectFrom('entries')
            .select('id')
            .where('competition_id', '=', competition.id)
            .where(
              sql<boolean>`data->'state'->'roster'->'holdings' @> ${JSON.stringify([{ footballerId: update.footballerId }])}::jsonb`,
              '=',
              true,
            )
            .executeTakeFirst();
          if (owned)
            throw new CommandRejected('position-change-invalidates-holdings');
        }
        if (
          previous &&
          previous.price !== update.price &&
          nextDeadline &&
          competition.status !== 'draft'
        ) {
          acceptanceCutoff = new Date(
            nextDeadline.deadline.getTime() -
              currentPricing.freezeHours * 60 * 60_000,
          );
          if (acceptanceCutoff <= now)
            throw new CommandRejected('price-freeze-window');
        }
        if (
          previous &&
          previous.position === update.position &&
          previous.price === update.price &&
          previous.selectable === update.selectable &&
          previous.manuallyPinned === update.manuallyPinned
        )
          continue;
        const data = poolPlayerSchema.parse({
          ...update,
          competitionId: competition.id,
          priceRevision: previous ? previous.priceRevision + 1 : 1,
        });
        await tx
          .insertInto('competition_players')
          .values({
            competition_id: competition.id,
            footballer_id: data.footballerId,
            data,
          })
          .onConflict((oc) =>
            oc
              .columns(['competition_id', 'footballer_id'])
              .doUpdateSet({ data }),
          )
          .execute();
      }
    } else {
      if (new Set(command.fixtureIds).size !== command.fixtureIds.length)
        throw new CommandRejected('duplicate-fixture');
      const currentRow = await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', command.gameweekId)
        .forUpdate()
        .executeTakeFirst();
      const current = currentRow ? gameweekSchema.parse(currentRow.data) : null;
      if (
        current &&
        (current.competitionId !== competition.id ||
          current.status !== 'upcoming' ||
          Date.parse(current.deadline) <= now.getTime())
      )
        throw new CommandRejected('gameweek-locked');
      if (
        current &&
        competition.status !== 'draft' &&
        current.number !== command.number
      )
        throw new CommandRejected('published-gameweek-number-frozen');
      if (Date.parse(command.deadline) <= now.getTime())
        throw new CommandRejected('deadline-must-be-future');
      acceptanceCutoff = new Date(
        Math.min(
          Date.parse(command.deadline),
          current ? Date.parse(current.deadline) : Infinity,
        ),
      );
      const sameNumber = await tx
        .selectFrom('gameweeks')
        .select('id')
        .where('competition_id', '=', competition.id)
        .where('number', '=', command.number)
        .executeTakeFirst();
      if (sameNumber && sameNumber.id !== command.gameweekId)
        throw new CommandRejected('duplicate-gameweek-number');
      const rounds = (
        await tx
          .selectFrom('gameweeks')
          .select('data')
          .where('competition_id', '=', competition.id)
          .execute()
      ).map((g) => gameweekSchema.parse(g.data));
      if (
        rounds.some(
          (g) =>
            g.id !== command.gameweekId &&
            ((g.number < command.number &&
              Date.parse(g.deadline) >= Date.parse(command.deadline)) ||
              (g.number > command.number &&
                Date.parse(g.deadline) <= Date.parse(command.deadline))),
        )
      )
        throw new CommandRejected('gameweek-order');
      if (!current) {
        const active = await tx
          .selectFrom('entries')
          .select('data')
          .where('competition_id', '=', competition.id)
          .execute();
        if (
          active.some((row) => {
            const entry = entrySchema.parse(row.data);
            return (
              entry.status === 'active' &&
              (rounds.find((g) => g.id === entry.editingGameweekId)?.number ??
                0) > command.number
            );
          })
        )
          throw new CommandRejected('new-gameweek-precedes-active-editing');
      }
      await protectRuleNotice(tx, competition.id, [
        ...rounds.filter((r) => r.id !== command.gameweekId),
        {
          id: command.gameweekId,
          number: command.number,
          deadline: command.deadline,
        },
      ]);
      const promisedPools = await tx
        .selectFrom('prize_pools')
        .select('data')
        .where('competition_id', '=', competition.id)
        .where(sql<string>`data->>'state'`, '=', 'published')
        .execute();
      if (
        promisedPools.some(
          (p) =>
            p.data.firstGameweekId === command.gameweekId &&
            Date.parse(command.deadline) < Date.parse(p.data.eligibilityCutoff),
        )
      )
        throw new CommandRejected('prize-cutoff-protected');
      const lockedHigher = rounds.some(
        (g) =>
          g.id !== command.gameweekId &&
          g.number >= command.number &&
          g.status !== 'upcoming',
      );
      if (lockedHigher) throw new CommandRejected('gameweek-order');
      const oldAssignments = await tx
        .selectFrom('fixture_assignments')
        .select('fixture_id')
        .where('competition_id', '=', competition.id)
        .where('gameweek_id', '=', command.gameweekId)
        .execute();
      for (const old of oldAssignments.filter(
        (a) => !command.fixtureIds.includes(a.fixture_id),
      )) {
        const fixture = fixtureSchema.parse(
          (
            await tx
              .selectFrom('fixtures')
              .select('data')
              .where('id', '=', old.fixture_id)
              .executeTakeFirstOrThrow()
          ).data,
        );
        if (['live', 'suspended', 'finished'].includes(fixture.status))
          throw new CommandRejected('played-fixture-assignment-frozen');
      }
      const data = gameweekSchema.parse({
        id: command.gameweekId,
        competitionId: competition.id,
        number: command.number,
        name: command.name,
        deadline: command.deadline,
        status: 'upcoming',
        rules:
          current?.rules ??
          rounds
            .filter((r) => r.number < command.number)
            .sort((a, b) => b.number - a.number)[0]?.rules ??
          rounds
            .filter((r) => r.number > command.number)
            .sort((a, b) => a.number - b.number)[0]?.rules ??
          competition.rules,
        resultRevision: 0,
        lastMaterialChangeAt: null,
        finalizedAt: null,
        issues: [],
      });
      await tx
        .insertInto('gameweeks')
        .values({
          id: data.id,
          competition_id: competition.id,
          number: data.number,
          deadline: data.deadline,
          data,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            number: data.number,
            deadline: data.deadline,
            data,
          }),
        )
        .execute();
      for (const id of command.fixtureIds) {
        const row = await tx
          .selectFrom('fixtures')
          .select('data')
          .where('id', '=', id)
          .where('season_id', '=', competition.seasonId)
          .executeTakeFirst();
        if (!row) throw new CommandRejected('fixture-outside-season');
        const fixture = fixtureSchema.parse(row.data);
        const assignment = await tx
          .selectFrom('fixture_assignments')
          .select('gameweek_id')
          .where('competition_id', '=', competition.id)
          .where('fixture_id', '=', id)
          .executeTakeFirst();
        if (assignment && assignment.gameweek_id !== data.id) {
          const source = rounds.find((g) => g.id === assignment.gameweek_id);
          if (!source || ['finalized', 'review'].includes(source.status))
            throw new CommandRejected('source-gameweek-needs-review');
          const sourceLocked =
            source.status !== 'upcoming' ||
            Date.parse(source.deadline) <= now.getTime();
          if (sourceLocked && fixture.status !== 'postponed')
            throw new CommandRejected('only-unplayed-postponements-can-move');
          if (sourceLocked)
            await tx
              .updateTable('gameweeks')
              .set({
                data: { ...source, lastMaterialChangeAt: now.toISOString() },
              })
              .where('id', '=', source.id)
              .execute();
        }
        if (
          assignment?.gameweek_id !== data.id &&
          ['live', 'suspended', 'finished'].includes(fixture.status)
        )
          throw new CommandRejected('played-fixture-assignment-frozen');
        if (
          Date.parse(fixture.kickoff) <= Date.parse(data.deadline) &&
          fixture.status !== 'postponed'
        )
          throw new CommandRejected('deadline-must-precede-kickoff');
        await tx
          .insertInto('fixture_assignments')
          .values({
            competition_id: competition.id,
            fixture_id: id,
            gameweek_id: data.id,
          })
          .onConflict((oc) =>
            oc
              .columns(['competition_id', 'fixture_id'])
              .doUpdateSet({ gameweek_id: data.id }),
          )
          .execute();
      }
      for (const removed of oldAssignments.filter(
        (a) => !command.fixtureIds.includes(a.fixture_id),
      ))
        await tx
          .deleteFrom('fixture_assignments')
          .where('competition_id', '=', competition.id)
          .where('fixture_id', '=', removed.fixture_id)
          .execute();
    }
    if (command.kind === 'round') {
      // If the operator extends a previously exhausted calendar, the deadline
      // transition has already advanced the roster but had no future round ID.
      const next = await tx
        .selectFrom('gameweeks')
        .select('data')
        .where('competition_id', '=', competition.id)
        .where('deadline', '>', now)
        .where(sql<string>`data->>'status'`, '=', 'upcoming')
        .orderBy('number')
        .executeTakeFirst();
      if (next) {
        const active = await tx
          .selectFrom('entries')
          .select('data')
          .where('competition_id', '=', competition.id)
          .forUpdate()
          .execute();
        for (const row of active) {
          const entry = entrySchema.parse(row.data);
          if (
            entry.status !== 'active' ||
            entry.editingGameweekId === next.data.id
          )
            continue;
          const snapshot = await tx
            .selectFrom('entry_snapshots')
            .select('entry_id')
            .where('entry_id', '=', entry.id)
            .where('gameweek_id', '=', entry.editingGameweekId)
            .executeTakeFirst();
          if (snapshot) {
            const updated = {
              ...entry,
              editingGameweekId: next.data.id,
              revision: entry.revision + 1,
            };
            await tx
              .updateTable('entries')
              .set({ data: updated, revision: updated.revision })
              .where('id', '=', entry.id)
              .execute();
          }
        }
      }
    }
    const acceptance = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!acceptance || (acceptanceCutoff && acceptance >= acceptanceCutoff))
      throw new CommandRejected(
        command.kind === 'pool' ? 'price-freeze-window' : 'deadline-passed',
      );
    const updated = { ...competition, revision: competition.revision + 1 };
    await tx
      .updateTable('competitions')
      .set({ revision: updated.revision, data: updated })
      .where('id', '=', updated.id)
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: sql<Date>`clock_timestamp()`,
        result: updated,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `competition.setup.${command.kind}`,
        scope_id: competition.id,
        reason: command.reason,
        payload: {
          revision: updated.revision,
          initialPriceEvidence,
          count:
            command.kind === 'pool'
              ? command.players.length
              : command.fixtureIds.length,
        },
      })
      .execute();
    return updated;
  });
}
