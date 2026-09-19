import { requiredFixtureValue } from './required-fixture-value.ts';
import { randomUUID } from 'node:crypto';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  entrySchema,
  lockedEntrySchema,
  poolPlayerSchema,
} from '@fantasy/contracts';
import {
  CLASSIC_SCORING_RULES,
  CLASSIC_TRANSFER_RULES,
  CLASSIC_GAMEWEEK_OPTIONS,
} from '@fantasy/domain';
import type { acceptanceFixture } from './provider-acceptance-fixture.ts';
/** Two independent fantasy games share the same complete synthetic football report. */
export async function acceptanceRounds(
  db: ReturnType<typeof createDatabase>,
  f: Awaited<ReturnType<typeof acceptanceFixture>>,
) {
  const players = (
    await db
      .selectFrom('footballers')
      .select('data')
      .where('season_id', '=', f.fixture.seasonId)
      .execute()
  ).map((p) => p.data);
  const keepers = [
    requiredFixtureValue(f.identities.get(8004)),
    requiredFixtureValue(f.identities.get(8014)),
  ];
  const defenders = [
    8001,
    8003,
    ...Array.from({ length: 8 }, (_, i) => 8005 + i),
  ].map((id) => requiredFixtureValue(f.identities.get(id)));
  const roster = {
    holdings: [...keepers, ...defenders].map((footballerId) => ({
      footballerId,
      purchasePrice: 50,
    })),
    bank: 400,
    starterIds: [requiredFixtureValue(keepers[0]), ...defenders],
    reserveIds: [requiredFixtureValue(keepers[1])],
    captaincy: {
      captainId: requiredFixtureValue(defenders[0]),
      viceCaptainId: requiredFixtureValue(defenders[1]),
    },
  };
  const inventory = {
    wildcard: 0,
    'free-hit': 0,
    'bench-boost': 0,
    'triple-captain': 0,
  };
  const result = [];
  for (let index = 0; index < 2; index++) {
    const competition = competitionSchema.parse({
      id: randomUUID(),
      seasonId: f.fixture.seasonId,
      slug: `acceptance-${randomUUID()}`,
      name: { en: 'Synthetic shared match', ar: 'مباراة مشتركة للاختبار' },
      description: {
        en: 'Synthetic report finality proof',
        ar: 'اختبار نهائية النتائج',
      },
      status: 'running',
      entryLimit: 1,
      registrationOpens: '2026-01-01T00:00:00Z',
      registrationCloses: '2026-08-01T00:00:00Z',
      firstLockedAt: '2026-09-01T15:30:00Z',
      revision: 1,
      rules: {
        version: 1,
        squad: {
          squadSize: 12,
          starterCount: 11,
          quotas: { GK: 2, DEF: 10, MID: 0, FWD: 0 },
          formations: [{ GK: 1, DEF: 10, MID: 0, FWD: 0 }],
          startingBudget: 1000,
          clubCap: 12,
          captaincyEnabled: true,
        },
        transfer: CLASSIC_TRANSFER_RULES,
        scoring: CLASSIC_SCORING_RULES,
        gameweek: CLASSIC_GAMEWEEK_OPTIONS,
        enabledChips: [],
        chipInventory: inventory,
        chipWindows: [],
        ranking: 'shared',
        deadlineOffsetMinutes: 90,
        correctionWindowHours: 0,
      },
    });
    const round = gameweekSchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      number: 1,
      name: { en: 'Synthetic round', ar: 'جولة الاختبار' },
      deadline: competition.firstLockedAt,
      status: 'locked',
      rules: competition.rules,
      resultRevision: 0,
      lastMaterialChangeAt: null,
      finalizedAt: null,
      issues: [],
    });
    const entry = entrySchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      accountId: f.principal.accountId,
      name: 'Synthetic squad',
      status: 'active',
      activatedAt: '2026-08-01T00:00:00Z',
      firstGameweekId: round.id,
      editingGameweekId: round.id,
      revision: 1,
      state: {
        roster,
        permanentBaseline: null,
        freeTransfers: 1,
        transfersThisRound: 0,
        chip: null,
        inventory,
        beforeFreeHit: null,
      },
    });
    await db
      .insertInto('competitions')
      .values({
        id: competition.id,
        season_id: competition.seasonId,
        slug: competition.slug,
        revision: 1,
        data: competition,
      })
      .execute();
    await db
      .insertInto('gameweeks')
      .values({
        id: round.id,
        competition_id: competition.id,
        number: 1,
        deadline: round.deadline,
        data: round,
      })
      .execute();
    await db
      .insertInto('fixture_assignments')
      .values({
        competition_id: competition.id,
        gameweek_id: round.id,
        fixture_id: f.fixture.id,
      })
      .execute();
    await db
      .insertInto('entries')
      .values({
        id: entry.id,
        competition_id: competition.id,
        account_id: entry.accountId,
        revision: entry.revision,
        data: entry,
      })
      .execute();
    await db
      .insertInto('entry_snapshots')
      .values({
        entry_id: entry.id,
        competition_id: competition.id,
        gameweek_id: round.id,
        locked_at: round.deadline,
        payload: lockedEntrySchema.parse({
          roster,
          chip: null,
          transferDeduction: 0,
        }),
      })
      .execute();
    await db
      .insertInto('gameweek_player_pools')
      .values({
        gameweek_id: round.id,
        payload: {
          players: players.map((p) =>
            poolPlayerSchema.parse({
              competitionId: competition.id,
              footballerId: p.id,
              position: p.defaultPosition,
              price: 50,
              priceRevision: 1,
              selectable: true,
              manuallyPinned: false,
            }),
          ),
        },
      })
      .execute();
    result.push({ round, entry });
  }
  return result;
}
