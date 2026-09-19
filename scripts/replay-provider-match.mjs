import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import {
  fixtureSchema,
  providerIdentitySchema,
  providerSeasonBindingSchema,
} from '../packages/contracts/dist/index.js';
import { parseProviderMatch } from '../packages/application/dist/provider-match-parser.js';
import { CommandRejected } from '../packages/application/dist/errors.js';

// Offline inspection only: no environment credentials, database, transport or acceptance commands.
const { values } = parseArgs({
  options: {
    prefix: {
      type: 'string',
      default: '.local/provider-validation/2026-09-19-replay-',
    },
    fixture: { type: 'string', default: '1312376' },
    report: {
      type: 'string',
      default: '.local/provider-validation/historical-replay-report.json',
    },
  },
});
const fixtureId = Number(values.fixture);
assert.ok(Number.isSafeInteger(fixtureId) && fixtureId > 0);
const sources = {};
const hashes = {};
for (const resource of ['fixtures', 'players', 'lineups', 'events']) {
  const file = `${values.prefix}${resource}.json`;
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    throw new Error(
      `Missing private replay input: ${file}. No API call was made.`,
    );
  }
  hashes[resource] = createHash('sha256').update(bytes).digest('hex');
  sources[resource] = JSON.parse(bytes.toString('utf8')).payload;
}
const matching = sources.fixtures.response.filter(
  (row) => row.fixture.id === fixtureId,
);
assert.equal(matching.length, 1, 'The fixture must occur exactly once');
const actual = matching[0];
assert.equal(
  actual.league.id,
  233,
  'This rehearsal targets the Egyptian Premier League',
);
assert.equal(
  actual.league.season,
  2024,
  'This rehearsal is for historical 2024 data only',
);
const seasonId = randomUUID();
const fixture = fixtureSchema.parse({
  id: randomUUID(),
  seasonId,
  homeClubId: randomUUID(),
  awayClubId: randomUUID(),
  kickoff: new Date(actual.fixture.date).toISOString(),
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
  leagueId: 233,
  seasonYear: 2024,
  evidenceId: randomUUID(),
  rightsReference:
    'User-authorized offline historical testing; temporary mapping, no publication approval asserted',
  createdAt: new Date().toISOString(),
});
const roster = new Set(
  sources.lineups.response.flatMap((team) =>
    [...team.startXI, ...team.substitutes].map((row) => row.player.id),
  ),
);
const statistics = new Set(
  sources.players.response.flatMap((team) =>
    team.players.map((row) => row.player.id),
  ),
);
const identities = [
  { kind: 'fixture', externalId: fixtureId, entityId: fixture.id },
  {
    kind: 'club',
    externalId: actual.teams.home.id,
    entityId: fixture.homeClubId,
  },
  {
    kind: 'club',
    externalId: actual.teams.away.id,
    entityId: fixture.awayClubId,
  },
  // Invalid IDs cannot become temporary mappings. The original source stays
  // untouched so the adapter rejects it and the diagnostic still writes a report.
  ...[...new Set([...roster, ...statistics])]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .map((externalId) => ({
      kind: 'footballer',
      externalId,
      entityId: randomUUID(),
    })),
].map((identity) =>
  providerIdentitySchema.parse({
    ...identity,
    id: randomUUID(),
    bindingId: binding.id,
    state: 'active',
    revision: 1,
    evidenceId: binding.evidenceId,
    updatedAt: binding.createdAt,
  }),
);
let result;
try {
  const draft = parseProviderMatch(fixture, binding, identities, {
    fixtures: {
      request: { resource: 'fixtures', league: 233, season: 2024 },
      payload: sources.fixtures,
    },
    players: {
      request: { resource: 'fixtures/players', fixture: fixtureId },
      payload: sources.players,
    },
    lineups: {
      request: { resource: 'fixtures/lineups', fixture: fixtureId },
      payload: sources.lineups,
    },
    events: {
      request: { resource: 'fixtures/events', fixture: fixtureId },
      payload: sources.events,
    },
  });
  result = {
    outcome: 'review-draft',
    issues: draft.issues,
    factsComplete: draft.observation.fixture.factsComplete,
    performanceCount: draft.observation.performances.length,
  };
} catch (error) {
  if (!(error instanceof CommandRejected)) throw error;
  result = { outcome: 'held', code: error.code };
}
const report = {
  observedAt: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  sourceTreeDirty:
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
      .length > 0,
  purpose: 'Offline 2024/25 testing; 2026/27 launch target unchanged',
  fixtureId,
  leagueId: 233,
  seasonYear: 2024,
  sourceHashes: hashes,
  temporaryIdentityMappings: true,
  invalidPlayerIds: [...new Set([...roster, ...statistics])].filter(
    (id) => !Number.isSafeInteger(id) || id <= 0,
  ),
  rosterPlayersMissingStatistics: [...roster].filter(
    (id) => !statistics.has(id),
  ).length,
  statisticsPlayersOutsideRoster: [...statistics].filter(
    (id) => !roster.has(id),
  ).length,
  result,
  outboundRequests: 0,
  databaseWrites: 0,
  accepted: false,
};
await mkdir(dirname(values.report), { recursive: true, mode: 0o700 });
await writeFile(values.report, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(JSON.stringify(report, null, 2));
