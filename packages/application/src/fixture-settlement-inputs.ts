import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { fixtureSchema, fixtureDispositionSchema } from '@fantasy/contracts';
/** The same recorded zero-performance scope is used by scoring and explicit settlement. */
export async function readFixtureSettlementInputs(
  tx: Kysely<Database>,
  gameweekId: string,
) {
  const fixtures = (
    await tx
      .selectFrom('fixture_assignments')
      .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
      .select('fixtures.data')
      .where('fixture_assignments.gameweek_id', '=', gameweekId)
      .orderBy('fixtures.id')
      .execute()
  ).map((r) => fixtureSchema.parse(r.data));
  const voidIds = fixtures
    .filter((f) => ['void', 'awarded'].includes(f.status))
    .map((f) => f.id);
  const rows = voidIds.length
    ? await tx
        .selectFrom('fixture_dispositions')
        .select('data')
        .where('fixture_id', 'in', voidIds)
        .distinctOn('fixture_id')
        .orderBy('fixture_id')
        .orderBy('revision', 'desc')
        .execute()
    : [];
  const dispositions = new Map(
    rows.map((r) => {
      const d = fixtureDispositionSchema.parse(r.data);
      return [d.fixtureId, d] as const;
    }),
  );
  const zeroPerformance = fixtures.every((f) =>
    ['void', 'awarded'].includes(f.status),
  );
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        fixtures.map((f) => ({
          id: f.id,
          status: f.status,
          dispositionRevision: dispositions.get(f.id)?.revision ?? null,
        })),
      ),
    )
    .digest('hex');
  const settlement = zeroPerformance
    ? await tx
        .selectFrom('empty_round_settlements')
        .select('fingerprint')
        .where('gameweek_id', '=', gameweekId)
        .executeTakeFirst()
    : null;
  const evidenceComplete = voidIds.every((id) => {
    const d = dispositions.get(id);
    return d && d.choice.outcome !== 'release';
  });
  return {
    fixtures,
    dispositions,
    zeroPerformance,
    fingerprint,
    evidenceComplete,
    approved: settlement?.fingerprint === fingerprint,
  };
}
