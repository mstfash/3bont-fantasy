import { createHash } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  competitionRulesSchema,
  factChangeSchema,
  fixtureSchema,
  fixtureObservationSchema,
  poolPlayerSchema,
  type Gameweek,
  type PlayerRoundResult,
} from '@fantasy/contracts';
import {
  scoreFixture,
  sumPoints,
  type FixturePerformance,
} from '@fantasy/domain';

/** Called inside the publisher's repeatable-read transaction: one coherent football-data snapshot. */
export async function calculateRoundInputs(
  tx: Kysely<Database> | Transaction<Database>,
  round: Gameweek,
) {
  const frozen = await tx
    .selectFrom('gameweek_player_pools')
    .select('payload')
    .where('gameweek_id', '=', round.id)
    .executeTakeFirst();
  const pool = (frozen?.payload.players ?? []).map((p) =>
    poolPlayerSchema.parse(p),
  );
  const fixtures = (
    await tx
      .selectFrom('fixture_assignments')
      .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
      .select('fixtures.data')
      .where('fixture_assignments.gameweek_id', '=', round.id)
      .orderBy('fixtures.id')
      .execute()
  ).map((f) => fixtureSchema.parse(f.data));
  const issues: string[] = frozen ? [] : ['missing-locked-player-pool'];
  const contributions = new Map<string, FixturePerformance[]>();
  const unresolved = new Set<string>();
  let settled = fixtures.every((f) => ['finished', 'void'].includes(f.status));
  const evidence: object[] = [];
  for (const fixture of fixtures) {
    if (fixture.status === 'void') {
      evidence.push({ fixtureId: fixture.id, status: 'void' });
      continue;
    }
    const observationRow = await tx
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', fixture.id)
      .orderBy('revision', 'desc')
      .executeTakeFirst();
    const observation = observationRow
      ? fixtureObservationSchema.parse(observationRow.payload)
      : null;
    const overrides = await tx
      .selectFrom('fact_revisions')
      .selectAll()
      .where('fixture_id', '=', fixture.id)
      .where('is_override', '=', true)
      .orderBy('revision', 'desc')
      .execute();
    const active = new Map<
      string,
      { id: string; change: ReturnType<typeof factChangeSchema.parse> }
    >();
    for (const override of overrides)
      if (!active.has(override.footballer_id))
        active.set(override.footballer_id, {
          id: override.id,
          change: factChangeSchema.parse(override.payload),
        });
    const eligible = new Set(observation?.eligibleFootballerIds ?? []);
    for (const [id, override] of active)
      if (override.change.kind === 'performance') eligible.add(id);
    if (!observation?.eligibilityComplete || !fixture.factsComplete) {
      settled = false;
      issues.push(`${fixture.id}:incomplete-fixture-evidence`);
    }
    const effective: object[] = [];
    for (const player of pool) {
      const override = active.get(player.footballerId);
      const provider = observation?.performances.find(
        (p) => p.footballerId === player.footballerId,
      );
      const facts =
        override?.change.kind === 'performance' ? override.change : provider;
      if (!eligible.has(player.footballerId)) {
        if (!observation?.eligibilityComplete)
          unresolved.add(player.footballerId);
        continue;
      }
      if (!facts) {
        unresolved.add(player.footballerId);
        settled = false;
        issues.push(`${fixture.id}:${player.footballerId}:missing-performance`);
        continue;
      }
      const performance: FixturePerformance = {
        fixtureId: fixture.id,
        footballerId: player.footballerId,
        factRevision:
          override?.change.kind === 'performance'
            ? `override:${override.id}`
            : `observation:${String(observation?.fixture.revision ?? 0)}`,
        position: player.position,
        statistics: facts.statistics,
        discipline: facts.discipline,
      };
      contributions.set(player.footballerId, [
        ...(contributions.get(player.footballerId) ?? []),
        performance,
      ]);
      effective.push({
        footballerId: player.footballerId,
        statistics: facts.statistics,
        discipline: facts.discipline,
      });
      if (
        fixture.status !== 'finished' ||
        !fixture.factsComplete ||
        facts.statistics.minutes === null
      )
        unresolved.add(player.footballerId);
    }
    evidence.push({
      fixtureId: fixture.id,
      status: fixture.status,
      factsComplete: fixture.factsComplete,
      eligibilityComplete: observation?.eligibilityComplete ?? false,
      eligible: [...eligible].sort(),
      effective,
    });
  }
  const players: PlayerRoundResult[] = pool.map((player) => {
    let minutes = 0;
    let goals = 0;
    const scoredFixtures: PlayerRoundResult['fixtures'] = [];
    for (const performance of contributions.get(player.footballerId) ?? []) {
      const score = scoreFixture(performance, round.rules.scoring);
      if (score.status === 'blocked') {
        settled = false;
        unresolved.add(player.footballerId);
        issues.push(
          ...score.issues.map(
            (issue) =>
              `${performance.fixtureId}:${player.footballerId}:${issue.code}:${issue.path}`,
          ),
        );
        continue;
      }
      minutes += performance.statistics.minutes ?? 0;
      goals += performance.statistics.goals ?? 0;
      scoredFixtures.push({
        fixtureId: performance.fixtureId,
        factRevision: performance.factRevision,
        points: score.total,
        breakdown: [...score.breakdown],
      });
    }
    return {
      footballerId: player.footballerId,
      position: player.position,
      minutes:
        unresolved.has(player.footballerId) && minutes === 0 ? null : minutes,
      points: sumPoints(scoredFixtures.map((s) => s.points)),
      goals,
      fixtures: scoredFixtures,
    };
  });
  // Presentation and provider delivery IDs do not restart the correction window.
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        rules: competitionRulesSchema.parse(round.rules),
        pool: pool
          .map((p) => ({ id: p.footballerId, position: p.position }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        evidence,
        issues,
      }),
    )
    .digest('hex');
  return {
    players,
    fingerprint,
    settled: settled && issues.length === 0,
    issues: issues.slice(0, 1000),
  };
}
