import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProviderIdentityEvidence as read } from '../src/provider-identity-evidence.ts';
import { CommandRejected } from '../src/errors.ts';
const envelope = (get: string, response: unknown[]) => ({
  get,
  errors: [],
  results: response.length,
  paging: { current: 1, total: 1 },
  response,
});
const binding = { leagueId: 900001, seasonYear: 2026 };
void test('identity discovery requires an exact season and rejects conflicting duplicate IDs', () => {
  const request = {
    resource: 'leagues' as const,
    country: 'Egypt' as const,
    season: 2026,
  };
  const row = {
    league: { id: 900001, name: 'Synthetic league' },
    country: { name: 'Egypt' },
    seasons: [{ year: 2026 }],
  };
  assert.deepEqual(read(request, envelope('leagues', [row])), [
    { externalId: 900001, label: 'Synthetic league' },
  ]);
  assert.deepEqual(
    read({ ...request, season: 2027 }, envelope('leagues', [row])),
    [],
  );
  assert.throws(
    () => read(request, envelope('leagues', [row, row])),
    CommandRejected,
  );
  assert.throws(
    () => read(request, { ...envelope('leagues', [row]), results: 2 }),
    CommandRejected,
  );
  assert.throws(
    () =>
      read(request, {
        ...envelope('leagues', [row]),
        errors: { plan: 'Not covered' },
      }),
    CommandRejected,
  );
});
void test('player identity survives a transfer without choosing a club and validates page/scope', () => {
  const request = {
    resource: 'players' as const,
    league: 900001,
    season: 2026,
    page: 2,
  };
  const row = {
    player: { id: 100, name: 'Same name' },
    statistics: [
      { league: { id: 900001, season: 2026 }, team: { id: 1 } },
      { league: { id: 900001, season: 2026 }, team: { id: 2 } },
    ],
  };
  const payload = {
    ...envelope('players', [row]),
    paging: { current: 2, total: 3 },
  };
  assert.deepEqual(read(request, payload, binding), [
    { externalId: 100, label: 'Same name' },
  ]);
  assert.throws(
    () => read({ ...request, page: 1 }, payload, binding),
    CommandRejected,
  );
  assert.throws(
    () => read(request, payload, { ...binding, leagueId: 12 }),
    CommandRejected,
  );
  assert.throws(
    () =>
      read(
        request,
        { ...payload, response: [{ ...row, statistics: [] }] },
        binding,
      ),
    CommandRejected,
  );
});
void test('fixture identity retains home/away IDs and rejects foreign seasons or self fixtures', () => {
  const request = {
    resource: 'fixtures' as const,
    league: 900001,
    season: 2026,
  };
  const row = {
    fixture: { id: 345 },
    league: { id: 900001, season: 2026 },
    teams: { home: { id: 1, name: 'Home' }, away: { id: 2, name: 'Away' } },
  };
  assert.deepEqual(read(request, envelope('fixtures', [row]), binding), [
    {
      externalId: 345,
      label: 'Home / Away',
      homeExternalId: 1,
      awayExternalId: 2,
    },
  ]);
  assert.throws(
    () =>
      read(
        request,
        envelope('fixtures', [
          { ...row, league: { id: 900001, season: 2025 } },
        ]),
        binding,
      ),
    CommandRejected,
  );
  assert.throws(
    () =>
      read(
        request,
        envelope('fixtures', [
          { ...row, teams: { home: row.teams.home, away: row.teams.home } },
        ]),
        binding,
      ),
    CommandRejected,
  );
  assert.throws(
    () => read({ resource: 'status' }, envelope('status', [])),
    CommandRejected,
  );
});
