import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import type { Gameweek } from '@fantasy/contracts';
/** Caller holds the competition parent lock. Stabilize facts across every affected award window. */
export async function lockResultDependencies(
  tx: Transaction<Database>,
  round: Gameweek,
) {
  const dependentPools = await tx
    .selectFrom('prize_pools')
    .select('data')
    .where('competition_id', '=', round.competitionId)
    .where(sql<string>`data->>'state'`, '=', 'published')
    .execute();
  const affectedRoundIds = [
    ...new Set([
      round.id,
      ...dependentPools
        .filter((p) => p.data.gameweekIds.includes(round.id))
        .flatMap((p) => p.data.gameweekIds),
    ]),
  ];
  await tx
    .selectFrom('fixture_assignments')
    .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
    .select('fixtures.id')
    .where('fixture_assignments.gameweek_id', 'in', affectedRoundIds)
    .orderBy('fixtures.id')
    .forShare()
    .execute();
}
