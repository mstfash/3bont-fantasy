import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('offline replay writes a held report for zero player IDs instead of crashing during mapping', async () => {
  const directory = await mkdtemp(join(tmpdir(), '3bont-provider-replay-'));
  try {
    const prefix = join(directory, 'sample-');
    const report = join(directory, 'report.json');
    // Minimal deliberately invalid source: no provider account, credentials or database.
    const sources = {
      fixtures: {
        response: [
          {
            fixture: { id: 1312383, date: '2024-11-02T15:00:00Z' },
            league: { id: 233, season: 2024 },
            teams: { home: { id: 1 }, away: { id: 2 } },
          },
        ],
      },
      lineups: {
        response: [{ startXI: [{ player: { id: 0 } }], substitutes: [] }],
      },
      players: { response: [{ players: [{ player: { id: 0 } }] }] },
      events: { response: [] },
    };
    for (const [resource, payload] of Object.entries(sources))
      await writeFile(`${prefix}${resource}.json`, JSON.stringify({ payload }));
    execFileSync(
      process.execPath,
      [
        'scripts/replay-provider-match.mjs',
        '--prefix',
        prefix,
        '--fixture',
        '1312383',
        '--report',
        report,
      ],
      {
        cwd: new URL('../../', import.meta.url),
        env: { PATH: process.env.PATH },
        timeout: 15_000,
        stdio: 'pipe',
      },
    );
    const result = JSON.parse(await readFile(report, 'utf8'));
    assert.deepEqual(result.invalidPlayerIds, [0]);
    assert.deepEqual(result.result, {
      outcome: 'held',
      code: 'normalization-source-invalid',
    });
    assert.equal(result.accepted, false);
    assert.equal(result.outboundRequests, 0);
    assert.equal(result.databaseWrites, 0);
    assert.equal(Object.keys(result.sourceHashes).length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
