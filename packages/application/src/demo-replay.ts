import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  fixtureObservationSchema,
  fixtureSchema,
  gameweekSchema,
  type Footballer,
} from '@fantasy/contracts';
import { assessPlayerPool, buildEntry, POSITIONS } from '@fantasy/domain';
import { seedDemo } from './demo.ts';
import { advanceDueGameweeks } from './deadlines.ts';
import { publishGameweekResults } from './results.ts';

function replayId(label: string): string {
  const hash = createHash('sha256')
    .update(`3bont-synthetic-replay-v1:${label}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function syntheticPerformance(
  player: Footballer,
  team: readonly Footballer[],
  goals: number,
  conceded: number,
  round: number,
) {
  const positionIndex = team
    .filter((p) => p.defaultPosition === player.defaultPosition)
    .findIndex((p) => p.id === player.id);
  const plays =
    positionIndex < { GK: 1, DEF: 4, MID: 4, FWD: 2 }[player.defaultPosition];
  return {
    footballerId: player.id,
    statistics: {
      minutes: plays ? 90 : 0,
      goals:
        plays && player.defaultPosition === 'FWD' && positionIndex === 0
          ? goals
          : 0,
      assists:
        plays && player.defaultPosition === 'MID' && positionIndex === 0
          ? goals
          : 0,
      ownGoals: 0,
      penaltyMisses: 0,
      concededWhileOnPitch: plays ? conceded : 0,
      concededAfterDismissal: 0,
      savesIncludingPenalties: plays && player.defaultPosition === 'GK' ? 3 : 0,
      penaltySaves: 0,
    },
    discipline: {
      kind:
        plays &&
        player.defaultPosition === 'DEF' &&
        positionIndex === 2 &&
        round === 2
          ? ('yellow' as const)
          : ('none' as const),
    },
  };
}

/** Local fixture factory only. It creates fictional accounts without authentication or staff grants. */
export async function seedDemoReplay(db: ReturnType<typeof createDatabase>) {
  await seedDemo(db);
  const competitionId = replayId('competition');
  await db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('3bont:synthetic-replay',0))`.execute(
      tx,
    );
    if (
      await tx
        .selectFrom('competitions')
        .select('id')
        .where('id', '=', competitionId)
        .executeTakeFirst()
    )
      return;
    const source = competitionSchema.parse(
      (
        await tx
          .selectFrom('competitions')
          .select('data')
          .where('slug', '=', 'cairo-demo')
          .executeTakeFirstOrThrow()
      ).data,
    );
    const season = await tx
      .selectFrom('seasons')
      .select('data')
      .where('id', '=', source.seasonId)
      .executeTakeFirstOrThrow();
    if (!season.data.synthetic)
      throw new Error('Replay requires an explicitly synthetic season');
    const now = Date.now();
    const competition = competitionSchema.parse({
      ...source,
      id: competitionId,
      slug: 'cairo-replay',
      name: {
        ar: 'دوري العرض — ثلاث جولات مكتملة',
        en: 'Replay League — Three rounds played',
      },
      description: {
        ar: 'عرض مصطنع بأندية ولاعبين وحسابات خيالية. ثلاث جولات نهائية وثلاث قادمة لتجربة اللعب. نافذة التصحيح صفر في هذا العرض فقط.',
        en: 'Synthetic clubs, footballers and fictional demo accounts. Three finalized rounds and three upcoming rounds. This replay alone uses a zero-hour correction window.',
      },
      revision: 1,
      firstLockedAt: null,
      status: 'published',
      registrationOpens: new Date(now - 40 * 86400_000).toISOString(),
      registrationCloses: new Date(now + 60 * 86400_000).toISOString(),
      rules: { ...source.rules, correctionWindowHours: 0 },
    });
    await tx
      .insertInto('competitions')
      .values({
        id: competitionId,
        season_id: competition.seasonId,
        slug: competition.slug,
        revision: 1,
        data: competition,
      })
      .execute();
    const players = await tx
      .selectFrom('competition_players')
      .innerJoin(
        'footballers',
        'footballers.id',
        'competition_players.footballer_id',
      )
      .select([
        'competition_players.data as pool',
        'footballers.data as footballer',
      ])
      .where('competition_players.competition_id', '=', source.id)
      .orderBy('footballers.id')
      .execute();
    for (const p of players)
      await tx
        .insertInto('competition_players')
        .values({
          competition_id: competitionId,
          footballer_id: p.footballer.id,
          data: { ...p.pool, competitionId },
        })
        .execute();
    const sourceRounds = await tx
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', source.id)
      .orderBy('number')
      .execute();
    for (const sourceRound of sourceRounds) {
      const number = sourceRound.data.number;
      const id = replayId(`round:${String(number)}`);
      const deadline = new Date(
        now +
          (number <= 3 ? (number - 4) * 7 : 3 + (number - 4) * 7) * 86400_000,
      ).toISOString();
      const round = gameweekSchema.parse({
        ...sourceRound.data,
        id,
        competitionId,
        deadline,
        rules: competition.rules,
        status: 'upcoming',
        resultRevision: 0,
        lastMaterialChangeAt: null,
        finalizedAt: null,
        issues: [],
      });
      await tx
        .insertInto('gameweeks')
        .values({
          id,
          competition_id: competitionId,
          number,
          deadline,
          data: round,
        })
        .execute();
      const sourceFixtures = await tx
        .selectFrom('fixture_assignments')
        .innerJoin('fixtures', 'fixtures.id', 'fixture_assignments.fixture_id')
        .select('fixtures.data')
        .where('fixture_assignments.gameweek_id', '=', sourceRound.data.id)
        .orderBy('fixtures.id')
        .execute();
      for (const [index, original] of sourceFixtures.entries()) {
        const fixtureId = replayId(
          `fixture:${String(number)}:${String(index)}`,
        );
        const kickoff = new Date(
          Date.parse(deadline) + (90 + index * 120) * 60_000,
        ).toISOString();
        const fixture = fixtureSchema.parse({
          ...original.data,
          id: fixtureId,
          kickoff,
          status: number <= 3 ? 'finished' : 'scheduled',
          homeGoals: number <= 3 ? (number + index) % 3 : null,
          awayGoals: number <= 3 ? (number + index + 1) % 3 : null,
          factsComplete: number <= 3,
          revision: 1,
        });
        await tx
          .insertInto('fixtures')
          .values({
            id: fixtureId,
            season_id: competition.seasonId,
            kickoff,
            data: fixture,
          })
          .execute();
        await tx
          .insertInto('fixture_assignments')
          .values({
            competition_id: competitionId,
            fixture_id: fixtureId,
            gameweek_id: id,
          })
          .execute();
        if (number <= 3) {
          const home = players
            .filter((p) => p.footballer.clubId === fixture.homeClubId)
            .map((p) => p.footballer);
          const away = players
            .filter((p) => p.footballer.clubId === fixture.awayClubId)
            .map((p) => p.footballer);
          const performances = [
            ...home.map((p) =>
              syntheticPerformance(
                p,
                home,
                fixture.homeGoals ?? 0,
                fixture.awayGoals ?? 0,
                number,
              ),
            ),
            ...away.map((p) =>
              syntheticPerformance(
                p,
                away,
                fixture.awayGoals ?? 0,
                fixture.homeGoals ?? 0,
                number,
              ),
            ),
          ];
          const observation = fixtureObservationSchema.parse({
            fixture,
            eligibilityComplete: true,
            eligibleFootballerIds: [...home, ...away].map((p) => p.id),
            performances,
          });
          const evidenceId = replayId(`evidence:${fixtureId}`);
          await tx
            .insertInto('provider_evidence')
            .values({
              id: evidenceId,
              provider: 'synthetic-replay',
              resource: `fixture:${fixtureId}`,
              checksum: createHash('sha256')
                .update(JSON.stringify(observation))
                .digest('hex'),
              payload: observation,
            })
            .execute();
          await tx
            .insertInto('fixture_observations')
            .values({
              fixture_id: fixtureId,
              revision: 1,
              evidence_id: evidenceId,
              payload: observation,
            })
            .execute();
          for (const performance of performances)
            await tx
              .insertInto('fact_revisions')
              .values({
                id: replayId(`fact:${fixtureId}:${performance.footballerId}`),
                fixture_id: fixtureId,
                footballer_id: performance.footballerId,
                revision: 1,
                evidence_id: evidenceId,
                is_override: false,
                actor_id: 'system:synthetic-replay',
                reason: 'Explicitly fictional local fixture',
                payload: {
                  kind: 'performance',
                  statistics: performance.statistics,
                  discipline: performance.discipline,
                },
              })
              .execute();
        }
      }
    }
    const names = [
      'Nile Tacticians',
      'Cairo Captains',
      'Touchline Thinkers',
      'أبطال المدرج',
      'نجوم النيل',
      'خط الهجوم',
    ];
    for (const [index, name] of names.entries()) {
      const accountId = `demo:replay:${String(index)}`;
      await tx
        .insertInto('accounts')
        .values({
          id: accountId,
          display_name: `${name} (fictional demo)`,
          suspended_until: null,
        })
        .execute();
      const rotated = [
        ...players.slice(index * 11),
        ...players.slice(0, index * 11),
      ];
      const market = rotated.map((p) => ({
        footballerId: p.footballer.id,
        clubId: p.footballer.clubId,
        position: p.pool.position,
        price: p.pool.price,
      }));
      const readiness = assessPlayerPool(market, competition.rules.squad);
      if (!readiness.ready)
        throw new Error('Synthetic replay pool is not playable');
      const selected = market.filter((p) =>
        readiness.footballerIds.includes(p.footballerId),
      );
      const formation =
        competition.rules.squad.formations[
          index % competition.rules.squad.formations.length
        ];
      if (!formation) throw new Error('Replay formation missing');
      const starterIds = POSITIONS.flatMap((position) =>
        selected
          .filter((p) => p.position === position)
          .slice(0, formation[position])
          .map((p) => p.footballerId),
      );
      const captainId = starterIds[index + 1];
      const viceCaptainId = starterIds[0];
      if (!captainId || !viceCaptainId)
        throw new Error('Replay captaincy missing');
      const state = buildEntry(
        {
          players: selected,
          starterIds,
          reserveIds: selected
            .filter((p) => !starterIds.includes(p.footballerId))
            .map((p) => p.footballerId),
          captaincy: { captainId, viceCaptainId },
        },
        competition.rules.squad,
        competition.rules.chipInventory,
      );
      const entry = entrySchema.parse({
        id: replayId(`entry:${String(index)}`),
        competitionId,
        accountId,
        name,
        status: 'active',
        activatedAt: new Date(now - 30 * 86400_000).toISOString(),
        firstGameweekId: replayId('round:1'),
        editingGameweekId: replayId('round:1'),
        state,
        revision: 1,
      });
      await tx
        .insertInto('entries')
        .values({
          id: entry.id,
          competition_id: competitionId,
          account_id: accountId,
          revision: 1,
          data: entry,
        })
        .execute();
    }
    await tx
      .insertInto('audit_events')
      .values({
        id: replayId('audit'),
        actor_id: 'system:synthetic-replay',
        action: 'demo.replay-created',
        scope_id: competitionId,
        reason:
          'Fictional local demonstration; no authentication identities or staff grants created',
        payload: { synthetic: true },
      })
      .execute();
  });
  await advanceDueGameweeks(db, competitionId);
  for (let number = 1; number <= 3; number++)
    await publishGameweekResults(db, replayId(`round:${String(number)}`));
  return competitionId;
}
