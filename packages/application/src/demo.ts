import { createHash } from 'node:crypto';
import type { createDatabase } from '@fantasy/persistence';
import {
  clubSchema,
  competitionSchema,
  fixtureSchema,
  footballerSchema,
  gameweekSchema,
  poolPlayerSchema,
  seasonSchema,
} from '@fantasy/contracts';
import {
  CHIPS,
  CLASSIC_GAMEWEEK_OPTIONS,
  CLASSIC_SCORING_RULES,
  CLASSIC_SQUAD_RULES,
  CLASSIC_TRANSFER_RULES,
  POSITIONS,
  type Position,
} from '@fantasy/domain';

function demoId(label: string): string {
  const h = createHash('sha256').update(`3bont-demo-v1:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Local CLI only. Idempotent without overwriting squads or moving an existing deadline. */
export async function seedDemo(
  db: ReturnType<typeof createDatabase>,
): Promise<'created' | 'exists'> {
  return db.transaction().execute(async (tx) => {
    const competitionId = demoId('competition');
    if (
      await tx
        .selectFrom('competitions')
        .select('id')
        .where('id', '=', competitionId)
        .executeTakeFirst()
    )
      return 'exists';
    const now = new Date();
    const seasonId = demoId('season');
    const season = seasonSchema.parse({
      id: seasonId,
      name: { ar: 'موسم تجريبي مصطنع', en: 'Synthetic demonstration season' },
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
      synthetic: true,
    });
    await tx
      .insertInto('seasons')
      .values({ id: seasonId, data: season })
      .execute();
    const rules = {
      version: 1,
      squad: CLASSIC_SQUAD_RULES,
      transfer: CLASSIC_TRANSFER_RULES,
      scoring: CLASSIC_SCORING_RULES,
      gameweek: CLASSIC_GAMEWEEK_OPTIONS,
      enabledChips: CHIPS,
      chipInventory: {
        wildcard: 1,
        'free-hit': 1,
        'bench-boost': 1,
        'triple-captain': 1,
      },
      chipWindows: [],
      ranking: 'shared',
      deadlineOffsetMinutes: 90,
      correctionWindowHours: 24,
    };
    const competition = competitionSchema.parse({
      id: competitionId,
      seasonId,
      slug: 'cairo-demo',
      name: { ar: 'جولة القاهرة — تجربة', en: 'CAIRO ROUND — DEMO' },
      description: {
        ar: 'تجربة كاملة لبناء فريقك باستخدام أندية ولاعبين مصطنعين. ليست نتائج الدوري المصري الحقيقي.',
        en: 'Build your squad with fictional clubs and players. This is a demonstration, not live Egyptian Premier League data.',
      },
      status: 'published',
      rules,
      entryLimit: 3,
      registrationOpens: now.toISOString(),
      registrationCloses: new Date(
        now.getTime() + 60 * 86_400_000,
      ).toISOString(),
      firstLockedAt: null,
      revision: 1,
    });
    await tx
      .insertInto('competitions')
      .values({
        id: competitionId,
        season_id: seasonId,
        slug: competition.slug,
        revision: 1,
        data: competition,
      })
      .execute();
    const names = [
      { ar: 'نجوم النهر', en: 'River Stars', short: 'RIV', color: '#cc6156' },
      {
        ar: 'نسور الشرق',
        en: 'Eastern Eagles',
        short: 'EAG',
        color: '#7c96d9',
      },
      {
        ar: 'صقور المدينة',
        en: 'City Falcons',
        short: 'CTY',
        color: '#d5b65a',
      },
      {
        ar: 'أمواج الساحل',
        en: 'Coastal Waves',
        short: 'WAV',
        color: '#68bca9',
      },
      {
        ar: 'فرسان الوادي',
        en: 'Valley Knights',
        short: 'VAL',
        color: '#be83b7',
      },
      { ar: 'شباب الأفق', en: 'Horizon Youth', short: 'HOR', color: '#d99556' },
    ];
    const firstNames = [
      { ar: 'عمر', en: 'Omar' },
      { ar: 'يوسف', en: 'Youssef' },
      { ar: 'آدم', en: 'Adam' },
      { ar: 'مالك', en: 'Malek' },
      { ar: 'كريم', en: 'Karim' },
    ];
    const clubIds: string[] = [];
    for (const [index, clubName] of names.entries()) {
      const clubId = demoId(`club:${String(index)}`);
      clubIds.push(clubId);
      const club = clubSchema.parse({
        id: clubId,
        seasonId,
        name: { ar: clubName.ar, en: clubName.en },
        shortName: clubName.short,
        color: clubName.color,
      });
      await tx
        .insertInto('clubs')
        .values({ id: clubId, season_id: seasonId, data: club })
        .execute();
      const positions: Position[] = POSITIONS.flatMap((p) =>
        Array.from({ length: CLASSIC_SQUAD_RULES.quotas[p] }, () => p),
      );
      for (const [number, position] of positions.entries()) {
        const first = firstNames[number % firstNames.length];
        if (!first) throw new Error('Missing demo name');
        const id = demoId(`footballer:${String(index)}:${String(number)}`);
        const footballer = footballerSchema.parse({
          id,
          seasonId,
          clubId,
          name: {
            ar: `${first.ar} ${clubName.ar.split(' ')[1] ?? ''} ${String(number + 1)}`,
            en: `${first.en} ${clubName.short}-${String(number + 1)}`,
          },
          defaultPosition: position,
          shirtNumber: number + 1,
          status: 'available',
          valuation: null,
          synthetic: true,
        });
        await tx
          .insertInto('footballers')
          .values({
            id,
            season_id: seasonId,
            club_id: clubId,
            data: footballer,
          })
          .execute();
        const player = poolPlayerSchema.parse({
          competitionId,
          footballerId: id,
          position,
          price: { GK: 45, DEF: 50, MID: 65, FWD: 75 }[position],
          priceRevision: 1,
          selectable: true,
          manuallyPinned: false,
        });
        await tx
          .insertInto('competition_players')
          .values({
            competition_id: competitionId,
            footballer_id: id,
            data: player,
          })
          .execute();
      }
    }
    for (let number = 1; number <= 6; number++) {
      const id = demoId(`gameweek:${String(number)}`);
      const deadline = new Date(
        now.getTime() + (2 + (number - 1) * 7) * 86_400_000,
      ).toISOString();
      const round = gameweekSchema.parse({
        id,
        competitionId,
        number,
        name: {
          ar: `الجولة ${String(number)}`,
          en: `Gameweek ${String(number)}`,
        },
        deadline,
        status: 'upcoming',
        rules,
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
      for (let pairing = 0; pairing < 3; pairing++) {
        const home = clubIds[pairing];
        const away = clubIds[5 - pairing];
        if (!home || !away) throw new Error('Invalid demo pairing');
        const fixtureId = demoId(
          `fixture:${String(number)}:${String(pairing)}`,
        );
        const kickoff = new Date(
          Date.parse(deadline) + (90 + pairing * 120) * 60_000,
        ).toISOString();
        const fixture = fixtureSchema.parse({
          id: fixtureId,
          seasonId,
          homeClubId: home,
          awayClubId: away,
          kickoff,
          status: 'scheduled',
          homeGoals: null,
          awayGoals: null,
          factsComplete: false,
          revision: 1,
        });
        await tx
          .insertInto('fixtures')
          .values({
            id: fixtureId,
            season_id: seasonId,
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
      }
      const rotating = clubIds.pop();
      if (rotating) clubIds.splice(1, 0, rotating);
    }
    return 'created';
  });
}
