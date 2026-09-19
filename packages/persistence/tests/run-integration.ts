import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';

const execute = promisify(execFile);
const password = randomBytes(24).toString('hex');
let container = '';
try {
  const launched = await execute(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--label',
      'fantasy-platform-purpose=integration-test',
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_DB=fantasy_proof',
      '--env',
      'POSTGRES_USER=fantasy_test',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      'postgres:17-alpine',
    ],
    { timeout: 120_000 },
  );
  container = launched.stdout.trim();
  if (!/^[a-f0-9]{64}$/u.test(container))
    throw new Error('Unexpected Docker container ID');
  const mapped = await execute('docker', ['port', container, '5432/tcp']);
  const match = /^127\.0\.0\.1:(\d+)\s*$/u.exec(mapped.stdout);
  if (!match?.[1]) throw new Error('Expected a loopback-only database port');
  const connectionString = `postgresql://fantasy_test:${password}@127.0.0.1:${match[1]}/fantasy_proof`;
  const probe = new Pool({
    connectionString,
    connectionTimeoutMillis: 1000,
    max: 1,
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await probe.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await setTimeout(200);
      }
    }
    if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
    const version = await probe.query<{ version: string }>(
      "SELECT current_setting('server_version') AS version",
    );
    process.stdout.write(
      `Isolated PostgreSQL ${version.rows[0]?.version ?? 'unknown'} ready\n`,
    );
  } finally {
    await probe.end();
  }
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        '--test-timeout=120000',
        'tests/postgres*.test.ts',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, FANTASY_TEST_DATABASE_URL: connectionString },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve(code ?? 1);
    });
  });
  process.exitCode = exitCode;
} finally {
  if (container) await execute('docker', ['rm', '--force', container]);
}
