import { randomUUID } from 'node:crypto';
import {
  fixtureSchema,
  providerSeasonBindingSchema,
  providerIdentitySchema,
  type ProviderRequest,
} from '@fantasy/contracts';
export function normalizationFixture() {
  const seasonId = randomUUID(),
    home = randomUUID(),
    away = randomUUID();
  const players = [randomUUID(), randomUUID(), randomUUID()];
  const fixture = fixtureSchema.parse({
    id: randomUUID(),
    seasonId,
    homeClubId: home,
    awayClubId: away,
    kickoff: '2026-09-01T17:00:00Z',
    status: 'scheduled',
    homeGoals: null,
    awayGoals: null,
    factsComplete: false,
    revision: 1,
  });
  const binding = providerSeasonBindingSchema.parse({
    id: randomUUID(),
    provider: 'api-football-direct',
    seasonId,
    leagueId: 900028,
    seasonYear: 2026,
    evidenceId: randomUUID(),
    rightsReference: 'Synthetic normalization proof only',
    createdAt: new Date().toISOString(),
  });
  const mappings = [
    { kind: 'fixture', externalId: 9001, entityId: fixture.id },
    { kind: 'club', externalId: 7001, entityId: home },
    { kind: 'club', externalId: 7002, entityId: away },
    ...players.map((entityId, i) => ({
      kind: 'footballer',
      externalId: 8001 + i,
      entityId,
    })),
  ].map((m) =>
    providerIdentitySchema.parse({
      ...m,
      id: randomUUID(),
      bindingId: binding.id,
      state: 'active',
      revision: 1,
      evidenceId: binding.evidenceId,
      updatedAt: binding.createdAt,
    }),
  );
  const source = (request: ProviderRequest, response: unknown[]) => ({
    request,
    payload: {
      get: request.resource,
      parameters:
        'fixture' in request
          ? { fixture: String(request.fixture) }
          : { league: '900028', season: '2026' },
      errors: [],
      results: response.length,
      paging: { current: 1, total: 1 },
      response,
    },
  });
  const sources = {
    fixtures: source({ resource: 'fixtures', league: 900028, season: 2026 }, [
      {
        fixture: { id: 9001, date: fixture.kickoff, status: { short: 'FT' } },
        league: { id: 900028, season: 2026 },
        teams: { home: { id: 7001 }, away: { id: 7002 } },
        goals: { home: 1, away: 0 },
      },
    ]),
    players: source({ resource: 'fixtures/players', fixture: 9001 }, [
      {
        team: { id: 7001 },
        players: [
          {
            player: { id: 8001 },
            statistics: [
              {
                games: { minutes: 60, rating: '9.9' },
                goals: { total: 1, assists: 0, conceded: 99, saves: 88 },
                cards: { yellow: 0, red: 0 },
                penalty: { saved: 77 },
              },
            ],
          },
        ],
      },
      {
        team: { id: 7002 },
        players: [
          {
            player: { id: 8003 },
            statistics: [
              { games: { minutes: 90 }, goals: { total: 0, assists: null } },
            ],
          },
        ],
      },
    ]),
    lineups: source({ resource: 'fixtures/lineups', fixture: 9001 }, [
      {
        team: { id: 7001 },
        startXI: [{ player: { id: 8001 } }],
        substitutes: [{ player: { id: 8002 } }],
      },
      {
        team: { id: 7002 },
        startXI: [{ player: { id: 8003 } }],
        substitutes: [],
      },
    ]),
    events: source({ resource: 'fixtures/events', fixture: 9001 }, [
      {
        team: { id: 7001 },
        player: { id: 8001 },
        type: 'Goal',
        detail: 'Normal Goal',
      },
    ]),
  };
  return { fixture, binding, mappings, players, sources };
}
