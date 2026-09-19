import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  fixtureDispositionSchema,
  fixtureSchema,
  type Fixture,
  type MatchDataCommand,
} from '@fantasy/contracts';
import type { Principal } from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function latestFixtureDisposition(
  tx: Kysely<Database>,
  fixtureId: string,
) {
  const row = await tx
    .selectFrom('fixture_dispositions')
    .select('data')
    .where('fixture_id', '=', fixtureId)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
  return row ? fixtureDispositionSchema.parse(row.data) : null;
}
/** Assignment barrier and source fixture lock are held by the canonical reviewed mutation. */
export async function applyFixtureDisposition(
  tx: Transaction<Database>,
  principal: Principal,
  current: Fixture,
  command: Extract<MatchDataCommand, { kind: 'disposition' }>,
) {
  if (current.revision !== command.expectedRevision)
    throw new CommandRejected('fixture-changed');
  const last = await latestFixtureDisposition(tx, current.id);
  const active = last && last.choice.outcome !== 'release' ? last : null;
  if (command.choice.outcome === 'release' && !active)
    throw new CommandRejected('fixture-disposition-missing');
  if (command.choice.outcome !== 'release' && active)
    throw new CommandRejected('fixture-disposition-active');
  if (command.choice.outcome === 'replay') {
    const replacement = await tx
      .selectFrom('fixtures')
      .select('data')
      .where('id', '=', command.choice.replacementFixtureId)
      .forShare()
      .executeTakeFirst();
    if (
      !replacement ||
      replacement.data.id === current.id ||
      replacement.data.seasonId !== current.seasonId ||
      replacement.data.homeClubId !== current.homeClubId ||
      replacement.data.awayClubId !== current.awayClubId ||
      !['scheduled', 'postponed'].includes(replacement.data.status)
    )
      throw new CommandRejected('invalid-replay-fixture');
    const linked = await tx
      .selectFrom('fixture_dispositions')
      .select('data')
      .distinctOn('fixture_id')
      .orderBy('fixture_id')
      .orderBy('revision', 'desc')
      .execute();
    if (
      linked.some(
        (r) =>
          r.data.choice.outcome === 'replay' &&
          r.data.choice.replacementFixtureId === replacement.data.id,
      )
    )
      throw new CommandRejected('replay-fixture-already-linked');
    const replacementDisposition = await latestFixtureDisposition(
      tx,
      replacement.data.id,
    );
    if (
      replacementDisposition &&
      replacementDisposition.choice.outcome !== 'release'
    )
      throw new CommandRejected('invalid-replay-fixture');
    const locked = await tx
      .selectFrom('fixture_assignments')
      .innerJoin('gameweeks', 'gameweeks.id', 'fixture_assignments.gameweek_id')
      .select('gameweeks.id')
      .where('fixture_assignments.fixture_id', '=', replacement.data.id)
      .where((eb) =>
        eb.or([
          sql<boolean>`gameweeks.data->>'status' <> 'upcoming'`,
          sql<boolean>`gameweeks.deadline <= clock_timestamp()`,
        ]),
      )
      .executeTakeFirst();
    if (locked) throw new CommandRejected('replay-destination-locked');
  }
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  const disposition = fixtureDispositionSchema.parse({
    id: randomUUID(),
    fixtureId: current.id,
    revision: (last?.revision ?? 0) + 1,
    choice: command.choice,
    officialReference: command.officialReference,
    reason: command.reason,
    actorId: principal.accountId,
    recordedAt: now.toISOString(),
    previousFixture: current,
  });
  await tx
    .insertInto('fixture_dispositions')
    .values({
      id: disposition.id,
      fixture_id: current.id,
      revision: disposition.revision,
      data: disposition,
    })
    .execute();
  const previouslyPlayed =
    active &&
    ['live', 'suspended', 'finished'].includes(active.previousFixture.status);
  const updated = fixtureSchema.parse({
    ...current,
    revision: current.revision + 1,
    status:
      command.choice.outcome === 'release'
        ? previouslyPlayed
          ? 'suspended'
          : 'scheduled'
        : command.choice.outcome === 'awarded'
          ? 'awarded'
          : 'void',
    ...(command.choice.outcome === 'awarded'
      ? {
          homeGoals: command.choice.homeGoals,
          awayGoals: command.choice.awayGoals,
        }
      : command.choice.outcome === 'release' && active
        ? {
            homeGoals: active.previousFixture.homeGoals,
            awayGoals: active.previousFixture.awayGoals,
          }
        : {}),
    factsComplete: command.choice.outcome !== 'release',
  });
  await tx
    .updateTable('fixtures')
    .set({ data: updated })
    .where('id', '=', current.id)
    .execute();
  return updated;
}
