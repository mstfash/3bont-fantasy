import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';
import { planHistoricalTestDraft } from './historical-test-plan.ts';
import { catalogueFingerprint } from './catalogue.ts';

/** Called only by the local fixture CLI; an existing rehearsal is never overwritten. */
export async function seedHistoricalTestDraft(
  db: ReturnType<typeof createDatabase>,
  payload: unknown,
  sourceChecksum: string,
) {
  if (!/^[a-f0-9]{64}$/u.test(sourceChecksum))
    throw new Error('Expected a source SHA-256');
  const plan = planHistoricalTestDraft(payload);
  const fingerprint = catalogueFingerprint(plan);
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('3bont:historical-test-draft',0))`.execute(
      tx,
    );
    const existing = await tx
      .selectFrom('competitions')
      .select('id')
      .where('id', '=', plan.competition.id)
      .executeTakeFirst();
    if (existing) {
      const audit = await tx
        .selectFrom('audit_events')
        .select('payload')
        .where('scope_id', '=', plan.competition.id)
        .where('action', '=', 'historical-test.draft-created')
        .executeTakeFirst();
      const recorded = z
        .object({ fingerprint: z.string() })
        .safeParse(audit?.payload);
      if (!recorded.success || recorded.data.fingerprint !== fingerprint)
        throw new Error(
          'Historical test source changed; review it through admin before updating',
        );
      return { state: 'exists' as const, competitionId: existing.id };
    }
    await tx
      .insertInto('seasons')
      .values({ id: plan.season.id, data: plan.season })
      .execute();
    for (const club of plan.clubs)
      await tx
        .insertInto('clubs')
        .values({ id: club.id, season_id: club.seasonId, data: club })
        .execute();
    const competition = plan.competition;
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
    const round = plan.round;
    await tx
      .insertInto('gameweeks')
      .values({
        id: round.id,
        competition_id: round.competitionId,
        number: round.number,
        deadline: round.deadline,
        data: round,
      })
      .execute();
    for (const fixture of plan.fixtures) {
      await tx
        .insertInto('fixtures')
        .values({
          id: fixture.id,
          season_id: fixture.seasonId,
          kickoff: fixture.kickoff,
          data: fixture,
        })
        .execute();
      await tx
        .insertInto('fixture_assignments')
        .values({
          competition_id: competition.id,
          fixture_id: fixture.id,
          gameweek_id: round.id,
        })
        .execute();
    }
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: 'local-historical-test-fixture',
        action: 'historical-test.draft-created',
        scope_id: competition.id,
        reason:
          'User selected 2024 for isolated local testing; 2026/27 launch is unchanged',
        payload: {
          fingerprint,
          sourceChecksum,
          leagueId: 233,
          seasonYear: 2024,
          fixtureMappings: plan.sourceMappings,
          acceptedPerformances: 0,
          sourcePlayerDataImported: false,
        },
      })
      .execute();
    return { state: 'created' as const, competitionId: competition.id };
  });
}
