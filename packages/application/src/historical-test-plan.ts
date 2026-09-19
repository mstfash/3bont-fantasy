import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  clubSchema,
  competitionSchema,
  fixtureSchema,
  gameweekSchema,
  seasonSchema,
} from '@fantasy/contracts';
import {
  CHIPS,
  CLASSIC_GAMEWEEK_OPTIONS,
  CLASSIC_SCORING_RULES,
  CLASSIC_SQUAD_RULES,
  CLASSIC_TRANSFER_RULES,
} from '@fantasy/domain';

const team = z.object({ id: z.int().positive(), name: z.string().min(1) });
const captureSchema = z
  .object({
    get: z.literal('fixtures'),
    parameters: z.object({
      league: z.union([z.literal(233), z.literal('233')]),
      season: z.union([z.literal(2024), z.literal('2024')]),
    }),
    errors: z
      .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
      .refine((value) => Object.keys(value).length === 0),
    paging: z.object({ current: z.literal(1), total: z.literal(1) }),
    results: z.int().positive(),
    response: z
      .array(
        z.object({
          fixture: z.object({
            id: z.int().positive(),
            date: z.iso.datetime({ offset: true }),
            status: z.object({ short: z.string() }),
          }),
          league: z.object({
            id: z.literal(233),
            season: z.literal(2024),
            round: z.string(),
          }),
          teams: z.object({ home: team, away: team }),
          goals: z.object({
            home: z.int().nonnegative().nullable(),
            away: z.int().nonnegative().nullable(),
          }),
        }),
      )
      .min(9)
      .max(2000),
  })
  .refine((value) => value.results === value.response.length);

export function historicalTestId(label: string): string {
  const hash = createHash('sha256')
    .update(`3bont:egypt-2024-test-v1:${label}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Original dates and observed scores only; no invented identities, valuations or accepted performances. */
export function planHistoricalTestDraft(payload: unknown) {
  const source = captureSchema.parse(payload);
  if (
    new Set(source.response.map((row) => row.fixture.id)).size !==
    source.response.length
  )
    throw new Error('Historical fixture IDs must be unique');
  const opening = source.response
    .filter((row) => row.league.round === 'Regular Season - 1')
    .sort(
      (a, b) =>
        Date.parse(a.fixture.date) - Date.parse(b.fixture.date) ||
        a.fixture.id - b.fixture.id,
    );
  if (
    opening.length !== 9 ||
    opening.some(
      (row) =>
        row.fixture.status.short !== 'FT' ||
        row.goals.home === null ||
        row.goals.away === null,
    )
  )
    throw new Error('Expected nine completed opening-round fixtures');
  const teams = opening.flatMap((row) => [row.teams.home, row.teams.away]);
  if (new Set(teams.map((row) => row.id)).size !== 18)
    throw new Error('Opening round must contain eighteen distinct clubs');
  const first = opening[0];
  if (!first) throw new Error('Opening fixture is missing');
  const season = seasonSchema.parse({
    id: historicalTestId('season'),
    name: {
      en: 'Egypt 2024/25 — historical testing',
      ar: 'مصر ٢٠٢٤/٢٥ — اختبار تاريخي',
    },
    startsAt: '2024-10-30T00:00:00Z',
    endsAt: '2025-06-02T00:00:00Z',
    synthetic: false,
  });
  if (
    opening.some(
      (row) =>
        Date.parse(row.fixture.date) < Date.parse(season.startsAt) ||
        Date.parse(row.fixture.date) >= Date.parse(season.endsAt),
    )
  )
    throw new Error('Historical fixture is outside the recorded season');
  const deadline = new Date(
    Date.parse(first.fixture.date) - 90 * 60_000,
  ).toISOString();
  const competition = competitionSchema.parse({
    id: historicalTestId('competition'),
    seasonId: season.id,
    slug: 'egypt-2024-test',
    name: {
      en: 'Egypt 2024/25 — TEST ONLY',
      ar: 'الدوري المصري ٢٠٢٤/٢٥ — للاختبار فقط',
    },
    description: {
      en: 'Private historical test draft. Real opening-round fixtures; player identities and match statistics await review. No live season, accepted scores or market valuations.',
      ar: 'مسودة خاصة للاختبار التاريخي. مباريات حقيقية من الجولة الأولى؛ هويات اللاعبين وإحصاءاتهم قيد المراجعة. ليست موسماً مباشراً ولا تتضمن نقاطاً معتمدة أو قيماً سوقية.',
    },
    status: 'draft',
    entryLimit: 3,
    registrationOpens: '2024-10-01T00:00:00Z',
    registrationCloses: deadline,
    firstLockedAt: null,
    revision: 1,
    rules: {
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
    },
  });
  const round = gameweekSchema.parse({
    id: historicalTestId('round:1'),
    competitionId: competition.id,
    number: 1,
    name: {
      en: 'Historical opening round — TEST',
      ar: 'الجولة الأولى التاريخية — اختبار',
    },
    deadline,
    status: 'upcoming',
    rules: competition.rules,
    resultRevision: 0,
    lastMaterialChangeAt: null,
    finalizedAt: null,
    issues: [],
  });
  const clubs = teams.map((row) =>
    clubSchema.parse({
      id: historicalTestId(`club:${String(row.id)}`),
      seasonId: season.id,
      // Provider names are retained until an Arabic catalogue review supplies translations.
      name: { en: row.name, ar: row.name },
      shortName: String(row.id),
      color: '#566170',
    }),
  );
  const fixtures = opening.map((row) =>
    fixtureSchema.parse({
      id: historicalTestId(`fixture:${String(row.fixture.id)}`),
      seasonId: season.id,
      homeClubId: historicalTestId(`club:${String(row.teams.home.id)}`),
      awayClubId: historicalTestId(`club:${String(row.teams.away.id)}`),
      kickoff: new Date(row.fixture.date).toISOString(),
      status: 'finished',
      homeGoals: row.goals.home,
      awayGoals: row.goals.away,
      factsComplete: false,
      revision: 1,
    }),
  );
  return {
    season,
    competition,
    round,
    clubs,
    fixtures,
    sourceMappings: opening.map((row) => ({
      fixtureId: historicalTestId(`fixture:${String(row.fixture.id)}`),
      externalId: row.fixture.id,
    })),
  };
}
