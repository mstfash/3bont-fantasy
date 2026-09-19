import { randomUUID } from 'node:crypto';
import { providerIdentitySchema } from '@fantasy/contracts';
import { normalizationFixture } from './provider-normalization-fixture.ts';

/** Synthetic complete match bundle; no claim about coverage or a vendor's actual null semantics. */
export function providerTimelineFixture({
  saves = 2,
  saved = 1,
  missed = 1,
}: {
  saves?: number | null;
  saved?: number | null;
  missed?: number | null;
} = {}) {
  const f = normalizationFixture();
  const home = [8001, ...Array.from({ length: 10 }, (_, i) => 8004 + i)];
  const away = [8003, ...Array.from({ length: 10 }, (_, i) => 8014 + i)];
  const externalIds = [...home, ...away, 8002, 8024];
  const identities = new Map(
    externalIds.map((id) => [
      id,
      f.mappings.find((m) => m.kind === 'footballer' && m.externalId === id)
        ?.entityId ?? randomUUID(),
    ]),
  );
  const mappings = [
    ...f.mappings.filter((m) => m.kind !== 'footballer'),
    ...[...identities].map(([externalId, entityId]) =>
      providerIdentitySchema.parse({
        id: randomUUID(),
        kind: 'footballer',
        externalId,
        entityId,
        bindingId: f.binding.id,
        state: 'active',
        revision: 1,
        evidenceId: f.binding.evidenceId,
        updatedAt: f.binding.createdAt,
      }),
    ),
  ];
  const player = (id: number) => ({
    player: { id },
    statistics: [
      {
        games: {
          minutes: id === 8003 ? 60 : id === 8024 ? 30 : 90,
          position: [8004, 8014].includes(id) ? 'G' : 'D',
        },
        goals: {
          total: id === 8001 ? 2 : 0,
          assists: 0,
          saves: id === 8014 ? saves : id === 8004 ? 0 : null,
        },
        cards: { yellow: 0, red: 0 },
        penalty: {
          missed: id === 8001 ? missed : 0,
          saved: id === 8014 ? saved : 0,
        },
      },
    ],
  });
  const event = (id: number, minute: number, detail: string) => ({
    team: { id: 7001 },
    player: { id },
    time: { elapsed: minute, extra: null },
    type: 'Goal',
    detail,
  });
  const events = [
    event(8001, 20, 'Normal Goal'),
    event(8001, 35, 'Missed Penalty'),
    event(8003, 50, 'Own Goal'),
    {
      team: { id: 7002 },
      player: { id: 8003 },
      assist: { id: 8024 },
      time: { elapsed: 60, extra: null },
      type: 'subst',
      detail: 'Substitution 1',
    },
    event(8001, 70, 'Penalty'),
  ];
  const players = [
    { team: { id: 7001 }, players: home.map(player) },
    { team: { id: 7002 }, players: [...away, 8024].map(player) },
  ];
  const lineups = [
    {
      team: { id: 7001 },
      startXI: home.map((id) => ({ player: { id } })),
      substitutes: [{ player: { id: 8002 } }],
    },
    {
      team: { id: 7002 },
      startXI: away.map((id) => ({ player: { id } })),
      substitutes: [{ player: { id: 8024 } }],
    },
  ];
  const sources = {
    fixtures: {
      ...f.sources.fixtures,
      payload: {
        ...f.sources.fixtures.payload,
        response: [
          {
            fixture: {
              id: 9001,
              date: f.fixture.kickoff,
              status: { short: 'FT' },
            },
            league: { id: f.binding.leagueId, season: f.binding.seasonYear },
            teams: { home: { id: 7001 }, away: { id: 7002 } },
            goals: { home: 3, away: 0 },
          },
        ],
      },
    },
    players: {
      ...f.sources.players,
      payload: { ...f.sources.players.payload, response: players },
    },
    lineups: {
      ...f.sources.lineups,
      payload: { ...f.sources.lineups.payload, response: lineups },
    },
    events: {
      ...f.sources.events,
      payload: {
        ...f.sources.events.payload,
        response: events,
        results: events.length,
      },
    },
  };
  return { ...f, mappings, sources, identities };
}
