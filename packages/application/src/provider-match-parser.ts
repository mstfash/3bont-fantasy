import { z } from 'zod';
import {
  fixtureObservationSchema,
  type Fixture,
  type ProviderIdentity,
  type ProviderRequest,
  type ProviderSeasonBinding,
} from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
import { deriveProviderTimeline } from './provider-event-timeline.ts';
const id = z.int().positive();
const count = z.int().min(0).max(10000).nullish();
const envelope = z.object({
  get: z.string(),
  parameters: z.record(z.string(), z.union([z.string(), z.number()])),
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  results: z.int().nonnegative(),
  paging: z.object({ current: z.literal(1), total: z.literal(1) }),
  response: z.array(z.unknown()).max(2000),
});
const fixtureRow = z.object({
  fixture: z.object({
    id,
    date: z.iso.datetime({ offset: true }),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ id, season: z.int() }),
  teams: z.object({ home: z.object({ id }), away: z.object({ id }) }),
  goals: z.object({ home: count, away: count }),
});
const playerTeam = z.object({
  team: z.object({ id }),
  players: z
    .array(
      z.object({
        player: z.object({ id }),
        statistics: z
          .array(
            z.object({
              games: z.object({
                minutes: count,
                position: z.string().nullish(),
              }),
              goals: z.object({ total: count, assists: count, saves: count }),
              penalty: z.object({ missed: count, saved: count }).optional(),
              cards: z.object({ yellow: count, red: count }).optional(),
            }),
          )
          .length(1),
      }),
    )
    .max(100),
});
const lineup = z.object({
  team: z.object({ id }),
  startXI: z.array(z.object({ player: z.object({ id }) })).max(25),
  substitutes: z.array(z.object({ player: z.object({ id }) })).max(50),
});
const event = z.object({
  team: z.object({ id }),
  player: z.object({ id: id.nullable() }),
  assist: z.object({ id: id.nullable() }).optional(),
  time: z.object({ elapsed: count, extra: count }).optional(),
  type: z.string(),
  detail: z.string(),
});
export interface MatchSource {
  readonly request: ProviderRequest;
  readonly payload: unknown;
}

/** A conservative draft adapter: uncertain defensive/disciplinary semantics remain unknown. */
export function parseProviderMatch(
  fixture: Fixture,
  binding: ProviderSeasonBinding,
  identities: readonly ProviderIdentity[],
  sources: {
    fixtures: MatchSource;
    players: MatchSource;
    lineups: MatchSource;
    events: MatchSource;
  },
) {
  const used = new Map<string, ProviderIdentity>();
  const resolve = (kind: ProviderIdentity['kind'], externalId: number) => {
    const matches = identities.filter(
      (m) =>
        m.state === 'active' &&
        m.bindingId === binding.id &&
        m.kind === kind &&
        m.externalId === externalId,
    );
    const mapping = matches[0];
    if (!mapping || matches.length !== 1)
      throw new CommandRejected('normalization-mapping-missing');
    used.set(mapping.id, mapping);
    return mapping.entityId;
  };
  const fixtureMapping = identities.find(
    (m) =>
      m.state === 'active' &&
      m.kind === 'fixture' &&
      m.entityId === fixture.id &&
      m.bindingId === binding.id,
  );
  if (!fixtureMapping)
    throw new CommandRejected('normalization-mapping-missing');
  const externalFixture = fixtureMapping.externalId;
  resolve('fixture', externalFixture);
  const read = (source: MatchSource, resource: ProviderRequest['resource']) => {
    const parsed = envelope.safeParse(source.payload);
    if (
      !parsed.success ||
      source.request.resource !== resource ||
      parsed.data.get !== resource ||
      Object.keys(parsed.data.errors).length ||
      parsed.data.results !== parsed.data.response.length
    )
      throw new CommandRejected('normalization-source-invalid');
    const parameters = parsed.data.parameters;
    if (resource === 'fixtures') {
      if (
        !('league' in source.request) ||
        source.request.league !== binding.leagueId ||
        source.request.season !== binding.seasonYear ||
        String(parameters['league']) !== String(binding.leagueId) ||
        String(parameters['season']) !== String(binding.seasonYear)
      )
        throw new CommandRejected('normalization-source-scope');
    } else if (
      !('fixture' in source.request) ||
      source.request.fixture !== externalFixture ||
      String(parameters['fixture']) !== String(externalFixture) ||
      Object.keys(parameters).some((key) => key !== 'fixture')
    )
      throw new CommandRejected('normalization-source-scope');
    return parsed.data.response;
  };
  const fixtures = z
    .array(fixtureRow)
    .safeParse(read(sources.fixtures, 'fixtures'));
  const teams = z
    .array(playerTeam)
    .length(2)
    .safeParse(read(sources.players, 'fixtures/players'));
  const lineups = z
    .array(lineup)
    .length(2)
    .safeParse(read(sources.lineups, 'fixtures/lineups'));
  const events = z
    .array(event)
    .max(1000)
    .safeParse(read(sources.events, 'fixtures/events'));
  if (
    !fixtures.success ||
    !teams.success ||
    !lineups.success ||
    !events.success
  )
    throw new CommandRejected('normalization-source-invalid');
  const matching = fixtures.data.filter(
      (f) => f.fixture.id === externalFixture,
    ),
    source = matching[0];
  if (
    !source ||
    matching.length !== 1 ||
    source.league.id !== binding.leagueId ||
    source.league.season !== binding.seasonYear ||
    resolve('club', source.teams.home.id) !== fixture.homeClubId ||
    resolve('club', source.teams.away.id) !== fixture.awayClubId
  )
    throw new CommandRejected('normalization-source-scope');
  if (source.fixture.status.short !== 'FT')
    throw new CommandRejected('normalization-status-needs-review');
  if (Date.parse(source.fixture.date) !== Date.parse(fixture.kickoff))
    throw new CommandRejected('normalization-kickoff-changed');
  const clubIds = [source.teams.home.id, source.teams.away.id];
  const sameTeams = (rows: readonly { team: { id: number } }[]) =>
    rows.length === 2 &&
    new Set(rows.map((r) => r.team.id)).size === 2 &&
    rows.every((r) => clubIds.includes(r.team.id));
  if (
    !sameTeams(teams.data) ||
    !sameTeams(lineups.data) ||
    events.data.some((e) => !clubIds.includes(e.team.id))
  )
    throw new CommandRejected('normalization-source-scope');
  const participants = new Map<number, number>();
  for (const team of lineups.data)
    for (const row of [...team.startXI, ...team.substitutes]) {
      if (participants.has(row.player.id))
        throw new CommandRejected('normalization-duplicate-player');
      participants.set(row.player.id, team.team.id);
      resolve('footballer', row.player.id);
    }
  const rawStatistics = new Map(
    teams.data.flatMap((team) =>
      team.players.map((row) => [row.player.id, row.statistics[0]] as const),
    ),
  );
  const timeline = deriveProviderTimeline({
    home: source.teams.home.id,
    away: source.teams.away.id,
    homeGoals: source.goals.home ?? null,
    awayGoals: source.goals.away ?? null,
    players: lineups.data.flatMap((team) =>
      [...team.startXI, ...team.substitutes].map((row) => {
        const stats = rawStatistics.get(row.player.id);
        return {
          id: row.player.id,
          teamId: team.team.id,
          starter: team.startXI.some((p) => p.player.id === row.player.id),
          minutes: stats?.games.minutes ?? null,
          goals: stats?.goals.total ?? null,
          yellow: stats?.cards?.yellow ?? null,
          red: stats?.cards?.red ?? null,
        };
      }),
    ),
    events: events.data.map((item) => ({
      ...item,
      time: item.time
        ? {
            elapsed: item.time.elapsed ?? null,
            extra: item.time.extra ?? null,
          }
        : undefined,
    })),
  });
  const goalkeeperPenaltyTotals = new Map(
    teams.data.map((team) => {
      const counts = team.players
        .flatMap((row) => row.statistics)
        .filter((stats) => stats.games.position === 'G')
        .map((stats) => stats.penalty?.saved ?? null);
      return [
        team.team.id,
        counts.some((value) => value === null)
          ? null
          : counts.reduce<number>((total, value) => total + (value ?? 0), 0),
      ] as const;
    }),
  );
  const issues: string[] = [...timeline.issues, 'eligibility-needs-evidence'];
  const seen = new Set<number>();
  const performances = teams.data.flatMap((team) =>
    team.players.map((row) => {
      if (seen.has(row.player.id))
        throw new CommandRejected('normalization-duplicate-player');
      seen.add(row.player.id);
      if (participants.get(row.player.id) !== team.team.id)
        throw new CommandRejected('normalization-lineup-conflict');
      const stats = row.statistics[0];
      if (!stats) throw new CommandRejected('normalization-source-invalid');
      const derived = timeline.facts.get(row.player.id);
      const missedByOpponents = [...timeline.facts].reduce(
        (total, [playerId, facts]) =>
          participants.get(playerId) !== team.team.id
            ? total + facts.penaltyMisses
            : total,
        0,
      );
      const saves = stats.goals.saves ?? null,
        penaltySaved = stats.penalty?.saved ?? null;
      const teamPenaltySaves = goalkeeperPenaltyTotals.get(team.team.id);
      const savesVerified =
        derived &&
        stats.games.position === 'G' &&
        saves !== null &&
        penaltySaved !== null &&
        penaltySaved <= saves &&
        teamPenaltySaves !== null &&
        teamPenaltySaves !== undefined &&
        teamPenaltySaves <= missedByOpponents;
      return {
        footballerId: resolve('footballer', row.player.id),
        statistics: {
          minutes: stats.games.minutes ?? null,
          goals: stats.goals.total ?? derived?.goals ?? null,
          assists: stats.goals.assists ?? null,
          ownGoals: derived?.ownGoals ?? null,
          penaltyMisses:
            derived && stats.penalty?.missed === derived.penaltyMisses
              ? derived.penaltyMisses
              : null,
          concededWhileOnPitch: derived?.concededWhileOnPitch ?? null,
          concededAfterDismissal: derived?.concededAfterDismissal ?? null,
          savesIncludingPenalties: savesVerified ? saves : null,
          penaltySaves: savesVerified ? penaltySaved : null,
        },
        discipline: derived?.discipline ?? null,
      };
    }),
  );
  for (const item of events.data) {
    if (item.player.id !== null && !participants.has(item.player.id))
      issues.push('event-player-outside-lineup');
    if (!['Goal', 'Card', 'subst', 'Var'].includes(item.type))
      issues.push('unsupported-event-type');
  }
  if (
    performances.some(
      (p) =>
        p.statistics.minutes === null ||
        p.statistics.goals === null ||
        p.statistics.assists === null,
    )
  )
    issues.push('aggregate-values-missing');
  // Listed reserves missing from player stats stay unknown, never implicit zero-minute appearances.
  for (const externalId of participants.keys())
    if (!seen.has(externalId))
      performances.push({
        footballerId: resolve('footballer', externalId),
        statistics: {
          minutes: null,
          goals: null,
          assists: null,
          ownGoals: null,
          penaltyMisses: null,
          concededWhileOnPitch: null,
          concededAfterDismissal: null,
          savesIncludingPenalties: null,
          penaltySaves: null,
        },
        discipline: null,
      });
  const observation = fixtureObservationSchema.parse({
    fixture: {
      ...fixture,
      status: 'finished',
      homeGoals: source.goals.home ?? null,
      awayGoals: source.goals.away ?? null,
      factsComplete: false,
    },
    eligibilityComplete: false,
    eligibleFootballerIds: performances.map((p) => p.footballerId).sort(),
    performances: performances.sort((a, b) =>
      a.footballerId.localeCompare(b.footballerId),
    ),
  });
  if (
    performances.some(
      (p) =>
        p.statistics.concededWhileOnPitch === null ||
        p.statistics.concededAfterDismissal === null,
    )
  )
    issues.push('defensive-timeline-needs-review');
  if (
    performances.some(
      (p) =>
        p.statistics.ownGoals === null || p.statistics.penaltyMisses === null,
    )
  )
    issues.push('penalties-and-own-goals-need-review');
  if (performances.some((p) => p.discipline === null))
    issues.push('discipline-needs-review');
  if (
    performances.some(
      (p) => p.statistics.minutes === 0 && (p.statistics.assists ?? 0) > 0,
    )
  )
    issues.push('aggregate-values-conflict');
  return {
    observation,
    issues: [...new Set(issues)].sort(),
    mappings: [...used.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
