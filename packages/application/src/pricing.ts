import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  poolPlayerSchema,
  priceBatchCommandSchema,
  pricePreviewSchema,
  roundCalculationSchema,
  type Competition,
  type PriceBatchCommand,
} from '@fantasy/contracts';
import {
  proposePerformancePrice,
  type PriceObservation,
} from '@fantasy/domain';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';

async function calculatePricePreview(
  tx: Transaction<Database>,
  competition: Competition,
  now: Date,
) {
  const [roundRows, consumed, poolRows, batches] = await Promise.all([
    tx
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('number')
      .execute(),
    tx
      .selectFrom('price_batch_sources')
      .select('gameweek_id')
      .where('competition_id', '=', competition.id)
      .execute(),
    tx
      .selectFrom('competition_players')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('footballer_id')
      .execute(),
    tx
      .selectFrom('price_batches')
      .select('editing_gameweek_id')
      .where('competition_id', '=', competition.id)
      .execute(),
  ]);
  const rounds = roundRows.map((r) => gameweekSchema.parse(r.data));
  const target = rounds.find(
    (r) => r.status === 'upcoming' && Date.parse(r.deadline) > now.getTime(),
  );
  const pricingRules = target?.rules.pricing ?? competition.rules.pricing;
  const used = new Set(consumed.map((r) => r.gameweek_id));
  const sources: typeof rounds = [];
  for (const round of rounds) {
    if (round.status === 'upcoming') break;
    if (used.has(round.id)) continue;
    if (round.status !== 'finalized') break;
    sources.push(round);
  }
  const latestSource = sources.at(-1)?.number ?? 0;
  const history = new Map<string, PriceObservation[]>();
  for (const round of rounds.filter(
    (r) => r.status === 'finalized' && r.number <= latestSource,
  )) {
    const row = await tx
      .selectFrom('round_calculations')
      .select('payload')
      .where('gameweek_id', '=', round.id)
      .where('revision', '=', round.resultRevision)
      .executeTakeFirst();
    if (!row) throw new CommandRejected('finalized-calculation-unavailable');
    const calculation = roundCalculationSchema.parse(row.payload);
    if (!calculation.settled)
      throw new CommandRejected('finalized-calculation-incomplete');
    for (const p of calculation.players) {
      const observation = {
        gameweekId: round.id,
        revision: round.resultRevision,
        number: round.number,
        minutes: p.minutes,
        points: p.points,
      };
      const previous = history.get(p.footballerId);
      if (previous) previous.push(observation);
      else history.set(p.footballerId, [observation]);
    }
  }
  const changes = poolRows.map(({ data }) => {
    const player = poolPlayerSchema.parse(data);
    const proposed = proposePerformancePrice(
      player.price,
      player.manuallyPinned,
      history.get(player.footballerId) ?? [],
      pricingRules,
    );
    return {
      footballerId: player.footballerId,
      priceRevision: player.priceRevision,
      oldPrice: proposed.oldPrice,
      newPrice: proposed.newPrice,
      reason: proposed.reason,
      pointsSum: proposed.pointsSum.toString(),
      minutesSum: proposed.minutesSum,
      observations: proposed.observations,
    };
  });
  const publishBefore = target
    ? new Date(
        Date.parse(target.deadline) - pricingRules.freezeHours * 3600_000,
      ).toISOString()
    : null;
  const unresolvedHistory = rounds.some(
    (r) =>
      r.status === 'review' || (used.has(r.id) && r.status !== 'finalized'),
  );
  const blocked = !target
    ? 'no-editing-round'
    : unresolvedHistory
      ? 'results-under-review'
      : batches.some((b) => b.editing_gameweek_id === target.id)
        ? 'already-published-for-round'
        : publishBefore && Date.parse(publishBefore) <= now.getTime()
          ? 'freeze-window'
          : sources.length === 0
            ? 'no-new-finalized-round'
            : null;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        target: target?.id,
        deadline: target?.deadline,
        rules: pricingRules,
        sources: sources.map((r) => ({ id: r.id, revision: r.resultRevision })),
        changes,
      }),
    )
    .digest('hex');
  return pricePreviewSchema.parse({
    competitionId: competition.id,
    fingerprint,
    editingGameweekId: target?.id ?? null,
    publishBefore,
    sourceGameweekIds: sources.map((r) => r.id),
    blocked,
    changes,
    netChange: changes.reduce((sum, p) => sum + p.newPrice - p.oldPrice, 0),
    calculationVersion: 'performance-price-v1',
  });
}

export async function previewCompetitionPrices(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
) {
  requireCapability(
    principal,
    grants,
    'competition.manage',
    competitionId,
    new Date(),
  );
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const row = await tx
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', competitionId)
        .executeTakeFirst();
      if (!row) throw new CommandRejected('competition-unavailable');
      return calculatePricePreview(
        tx,
        competitionSchema.parse(row.data),
        new Date(),
      );
    });
}

export async function executePriceBatchCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: PriceBatchCommand,
) {
  const command = priceBatchCommandSchema.parse(input);
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
      return pricePreviewSchema.parse(cached.result);
    }
    const row = await tx
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', command.competitionId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new CommandRejected('competition-unavailable');
    const competition = competitionSchema.parse(row.data);
    if (!['published', 'running'].includes(competition.status))
      throw new CommandRejected('competition-closed');
    const clock = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!clock) throw new Error('Database clock unavailable');
    const preview = await calculatePricePreview(tx, competition, clock);
    if (preview.fingerprint !== command.expectedFingerprint)
      throw new CommandRejected('price-preview-changed');
    if (preview.blocked || !preview.editingGameweekId || !preview.publishBefore)
      throw new CommandRejected(preview.blocked ?? 'no-editing-round');
    const batchId = randomUUID();
    await tx
      .insertInto('price_batches')
      .values({
        id: batchId,
        competition_id: competition.id,
        editing_gameweek_id: preview.editingGameweekId,
        actor_id: principal.accountId,
        fingerprint: preview.fingerprint,
        payload: preview,
      })
      .execute();
    for (const source of preview.sourceGameweekIds)
      await tx
        .insertInto('price_batch_sources')
        .values({
          competition_id: competition.id,
          gameweek_id: source,
          batch_id: batchId,
        })
        .execute();
    for (const change of preview.changes.filter(
      (c) => c.newPrice !== c.oldPrice,
    )) {
      const current = poolPlayerSchema.parse(
        (
          await tx
            .selectFrom('competition_players')
            .select('data')
            .where('competition_id', '=', competition.id)
            .where('footballer_id', '=', change.footballerId)
            .executeTakeFirstOrThrow()
        ).data,
      );
      await tx
        .updateTable('competition_players')
        .set({
          data: {
            ...current,
            price: change.newPrice,
            priceRevision: current.priceRevision + 1,
          },
        })
        .where('competition_id', '=', competition.id)
        .where('footballer_id', '=', change.footballerId)
        .execute();
    }
    const accepted = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!accepted || accepted.getTime() >= Date.parse(preview.publishBefore))
      throw new CommandRejected('price-freeze-window');
    const updated = { ...competition, revision: competition.revision + 1 };
    await tx
      .updateTable('competitions')
      .set({ data: updated, revision: updated.revision })
      .where('id', '=', competition.id)
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: accepted,
        result: preview,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'prices.batch-published',
        scope_id: competition.id,
        reason: command.reason,
        payload: {
          batchId,
          sourceGameweekIds: preview.sourceGameweekIds,
          netChange: preview.netChange,
        },
      })
      .execute();
    return preview;
  });
}
