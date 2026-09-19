import { z } from 'zod';
import type { ProviderRequest } from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
const id = z.int().positive(),
  label = z.string().min(1).max(300);
const envelope = z.object({
  get: z.string(),
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  results: z.int().nonnegative(),
  paging: z.object({ current: z.int().positive(), total: z.int().positive() }),
  response: z.array(z.unknown()).max(2000),
});
const league = z.object({
  league: z.object({ id, name: label }),
  country: z.object({ name: z.literal('Egypt') }),
  seasons: z.array(z.object({ year: z.int() })),
});
const team = z.object({ team: z.object({ id, name: label }) });
const player = z.object({
  player: z.object({ id, name: label }),
  statistics: z
    .array(
      z.object({
        league: z.object({ id, season: z.int() }),
        team: z.object({ id }),
      }),
    )
    .min(1),
});
const fixture = z.object({
  fixture: z.object({ id }),
  league: z.object({ id, season: z.int() }),
  teams: z.object({
    home: z.object({ id, name: label }),
    away: z.object({ id, name: label }),
  }),
});
export interface ProviderIdentityCandidate {
  readonly externalId: number;
  readonly label: string;
  readonly homeExternalId?: number;
  readonly awayExternalId?: number;
}
/** Runtime validation of the ID-bearing subset; unknown fields never become fantasy facts. */
export function readProviderIdentityEvidence(
  request: ProviderRequest,
  payload: unknown,
  binding?: { leagueId: number; seasonYear: number },
): ProviderIdentityCandidate[] {
  const parsed = envelope.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.get !== request.resource ||
    Object.keys(parsed.data.errors).length ||
    parsed.data.results !== parsed.data.response.length
  )
    throw new CommandRejected('provider-identity-evidence-invalid');
  const data = parsed.data;
  if (request.resource === 'leagues') {
    const rows = z.array(league).safeParse(data.response);
    if (!rows.success)
      throw new CommandRejected('provider-identity-evidence-invalid');
    const candidates = rows.data
      .filter((r) => r.seasons.some((s) => s.year === request.season))
      .map((r) => ({ externalId: r.league.id, label: r.league.name }));
    if (new Set(candidates.map((c) => c.externalId)).size !== candidates.length)
      throw new CommandRejected('provider-identity-evidence-invalid');
    return candidates;
  }
  if (
    !binding ||
    !('league' in request) ||
    !('season' in request) ||
    request.league !== binding.leagueId ||
    request.season !== binding.seasonYear
  )
    throw new CommandRejected('provider-identity-scope-mismatch');
  let candidates: ProviderIdentityCandidate[];
  if (request.resource === 'teams') {
    const rows = z.array(team).safeParse(data.response);
    if (!rows.success)
      throw new CommandRejected('provider-identity-evidence-invalid');
    candidates = rows.data.map((r) => ({
      externalId: r.team.id,
      label: r.team.name,
    }));
  } else if (request.resource === 'players') {
    if (
      data.paging.current !== request.page ||
      data.paging.current > data.paging.total
    )
      throw new CommandRejected('provider-identity-evidence-invalid');
    const rows = z.array(player).safeParse(data.response);
    if (
      !rows.success ||
      rows.data.some(
        (r) =>
          !r.statistics.some(
            (s) =>
              s.league.id === binding.leagueId &&
              s.league.season === binding.seasonYear,
          ),
      )
    )
      throw new CommandRejected('provider-identity-evidence-invalid');
    candidates = rows.data.map((r) => ({
      externalId: r.player.id,
      label: r.player.name,
    }));
  } else {
    const rows = z.array(fixture).safeParse(data.response);
    if (
      !rows.success ||
      rows.data.some(
        (r) =>
          r.league.id !== binding.leagueId ||
          r.league.season !== binding.seasonYear ||
          r.teams.home.id === r.teams.away.id,
      )
    )
      throw new CommandRejected('provider-identity-evidence-invalid');
    candidates = rows.data.map((r) => ({
      externalId: r.fixture.id,
      label: `${r.teams.home.name} / ${r.teams.away.name}`,
      homeExternalId: r.teams.home.id,
      awayExternalId: r.teams.away.id,
    }));
  }
  if (new Set(candidates.map((c) => c.externalId)).size !== candidates.length)
    throw new CommandRejected('provider-identity-evidence-invalid');
  return candidates;
}
