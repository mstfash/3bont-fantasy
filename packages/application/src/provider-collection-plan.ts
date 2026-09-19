import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { createDatabase, Database } from '@fantasy/persistence';
import {
  providerCollectionSchema,
  type Fixture,
  type ProviderSchedule,
} from '@fantasy/contracts';

export function collectionInterval(
  schedule: ProviderSchedule,
  fixture: Pick<Fixture, 'kickoff' | 'status'>,
  now: Date,
): number | null {
  if (
    !schedule.enabled ||
    ['void', 'awarded', 'postponed'].includes(fixture.status)
  )
    return null;
  const elapsed = now.getTime() - Date.parse(fixture.kickoff);
  if (
    elapsed < -schedule.beforeKickoffMinutes * 60_000 ||
    elapsed > schedule.correctionHours * 3600_000
  )
    return null;
  return (
    (elapsed <= schedule.activeHours * 3600_000
      ? schedule.liveIntervalMinutes
      : schedule.correctionIntervalMinutes) * 60_000
  );
}
export function assignedFixture(tx: Transaction<Database>, fixtureId: string) {
  return tx
    .selectFrom('fixture_assignments')
    .innerJoin(
      'competitions',
      'competitions.id',
      'fixture_assignments.competition_id',
    )
    .select('fixture_assignments.fixture_id')
    .where('fixture_assignments.fixture_id', '=', fixtureId)
    .where(sql<string>`competitions.data->>'status'`, 'in', [
      'published',
      'running',
      'completed',
    ])
    .executeTakeFirst();
}
/** Planning is local-only: it reserves no provider quota and makes no network requests. */
export async function planProviderCollections(
  db: ReturnType<typeof createDatabase>,
) {
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'provider-collection-planner'},0))`.execute(
      tx,
    );
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    const schedules = await tx
      .selectFrom('provider_schedules')
      .innerJoin(
        'provider_accounts',
        'provider_accounts.id',
        'provider_schedules.account_id',
      )
      .innerJoin(
        'provider_season_bindings',
        'provider_season_bindings.id',
        'provider_schedules.binding_id',
      )
      .select([
        'provider_schedules.data as schedule',
        'provider_season_bindings.data as binding',
      ])
      .where(
        sql<boolean>`(provider_schedules.data->>'enabled')::boolean`,
        '=',
        true,
      )
      .where(sql<string>`provider_accounts.data->>'state'`, '=', 'enabled')
      .orderBy('provider_schedules.id')
      .forUpdate('provider_schedules')
      .execute();
    let planned = 0;
    for (const { schedule, binding } of schedules) {
      const fixtures = await tx
        .selectFrom('provider_identities')
        .innerJoin('fixtures', 'fixtures.id', 'provider_identities.entity_id')
        .select([
          'provider_identities.data as mapping',
          'fixtures.data as fixture',
        ])
        .where('provider_identities.binding_id', '=', binding.id)
        .where('provider_identities.kind', '=', 'fixture')
        .where(sql<string>`provider_identities.data->>'state'`, '=', 'active')
        .where('fixtures.season_id', '=', binding.seasonId)
        .where(
          'fixtures.kickoff',
          '>=',
          new Date(now.getTime() - schedule.correctionHours * 3600_000),
        )
        .where(
          'fixtures.kickoff',
          '<=',
          new Date(now.getTime() + schedule.beforeKickoffMinutes * 60_000),
        )
        .orderBy('fixtures.kickoff')
        .orderBy('fixtures.id')
        .limit(500)
        .execute();
      for (const { fixture, mapping } of fixtures) {
        const interval = collectionInterval(schedule, fixture, now);
        if (interval === null || !(await assignedFixture(tx, fixture.id)))
          continue;
        const active = await tx
          .selectFrom('provider_collection_batches')
          .select('id')
          .where('schedule_id', '=', schedule.id)
          .where('fixture_id', '=', fixture.id)
          .where('state', 'in', ['queued', 'collecting'])
          .executeTakeFirst();
        if (active) continue;
        const latest = await tx
          .selectFrom('provider_collection_batches')
          .select('planned_at')
          .where('schedule_id', '=', schedule.id)
          .where('fixture_id', '=', fixture.id)
          .orderBy('planned_at', 'desc')
          .executeTakeFirst();
        if (latest && now.getTime() - latest.planned_at.getTime() < interval)
          continue;
        const batch = providerCollectionSchema.parse({
          id: randomUUID(),
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          fixtureId: fixture.id,
          fixtureKickoff: fixture.kickoff,
          mappingId: mapping.id,
          mappingRevision: mapping.revision,
          requests: [
            {
              resource: 'fixtures',
              league: binding.leagueId,
              season: binding.seasonYear,
            },
            { resource: 'fixtures/players', fixture: mapping.externalId },
            { resource: 'fixtures/lineups', fixture: mapping.externalId },
            { resource: 'fixtures/events', fixture: mapping.externalId },
          ],
          state: 'queued',
          step: 0,
          plannedAt: now.toISOString(),
          startedAt: null,
          finishedAt: null,
          code: null,
        });
        await tx
          .insertInto('provider_collection_batches')
          .values({
            id: batch.id,
            schedule_id: schedule.id,
            fixture_id: fixture.id,
            mapping_id: mapping.id,
            mapping_revision: mapping.revision,
            state: batch.state,
            planned_at: now,
            next_attempt_at: now,
            claim_id: null,
            claimed_until: null,
            data: batch,
          })
          .execute();
        planned++;
      }
    }
    return { planned };
  });
}
