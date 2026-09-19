import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
const execute = promisify(execFile),
  suffix = randomBytes(6).toString('hex');
const directory = await mkdtemp(join(tmpdir(), '3bont-container-proof-'));
const network = `3bont-proof-${suffix}`,
  database = `${network}-database`,
  web = `${network}-web`,
  worker = `${network}-worker`,
  unready = `${network}-unready`;
const containers = [];
let networkCreated = false;
const secretValues = [];
const docker = async (args, timeout = 30000) =>
  (
    await execute('docker', args, { timeout, maxBuffer: 4 * 1024 * 1024 })
  ).stdout.trim();
const privateRun = async (args, timeout = 30000) => {
  try {
    return await docker(args, timeout);
  } catch {
    throw new Error(
      'A container operation failed. No process output or credentials were disclosed.',
    );
  }
};
async function eventually(check, label) {
  for (let i = 0; i < 45; i++) {
    if (await check()) return;
    await setTimeout(1000);
  }
  throw new Error(`Timed out: ${label}`);
}
const sql = async (statement) =>
  docker([
    'exec',
    database,
    'psql',
    '-U',
    'fantasy',
    '-d',
    'fantasy_container_proof',
    '-Atqc',
    statement,
  ]);
const hardened = [
  '--init',
  '--read-only',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=64m,mode=1777',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges:true',
];
try {
  const images = await Promise.all(
    ['web', 'worker'].map(async (target) => {
      const metadata = JSON.parse(
        await docker([
          'image',
          'inspect',
          '--format',
          '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"sizeBytes":{{json .Size}},"user":{{json .Config.User}}}',
          `3bont-fantasy-${target}:local-proof`,
        ]),
      );
      assert.match(metadata.id, /^sha256:[a-f0-9]{64}$/u);
      return { target, ...metadata };
    }),
  );
  const imageIds = Object.fromEntries(
    images.map((image) => [image.target, image.id]),
  );
  const password = randomBytes(24).toString('hex');
  secretValues.push(password);
  await writeFile(
    join(directory, 'database.env'),
    `POSTGRES_DB=fantasy_container_proof\nPOSTGRES_USER=fantasy\nPOSTGRES_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(directory, 'app.env'),
    `APP_ENV=local\nAPP_BASE_URL=http://127.0.0.1:3100\nDATABASE_URL=postgresql://fantasy:${password}@database:5432/fantasy_container_proof\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nMAIL_MODE=local\nMAIL_OUTBOX_DIR=/tmp/mail\n`,
    { mode: 0o600 },
  );
  await docker(['network', 'create', network]);
  networkCreated = true;
  containers.push(database);
  await privateRun([
    'run',
    '--detach',
    '--name',
    database,
    '--label',
    'fantasy-platform-purpose=container-proof',
    '--network',
    network,
    '--network-alias',
    'database',
    '--env-file',
    join(directory, 'database.env'),
    'postgres:17-alpine',
  ]);
  await eventually(async () => {
    try {
      await docker([
        'exec',
        database,
        'pg_isready',
        '-U',
        'fantasy',
        '-d',
        'fantasy_container_proof',
      ]);
      return true;
    } catch {
      return false;
    }
  }, 'isolated database readiness');
  containers.push(web);
  await privateRun([
    'run',
    '--detach',
    '--name',
    web,
    '--label',
    'fantasy-platform-purpose=container-proof',
    ...hardened,
    '--network',
    network,
    '--env-file',
    join(directory, 'app.env'),
    '--publish',
    '127.0.0.1::3100',
    imageIds.web,
  ]);
  const port = await docker(['port', web, '3100/tcp']);
  assert.match(port, /^127\.0\.0\.1:\d+$/u);
  const base = `http://${port}`;
  const health = () =>
    fetch(`${base}/api/health`, { signal: AbortSignal.timeout(6000) });
  await eventually(async () => {
    try {
      return (await health()).status === 503;
    } catch {
      return false;
    }
  }, 'unmigrated web returns unavailable');
  assert.deepEqual(await (await health()).json(), { status: 'unavailable' });
  containers.push(unready);
  await privateRun([
    'run',
    '--detach',
    '--name',
    unready,
    '--label',
    'fantasy-platform-purpose=container-proof',
    ...hardened,
    '--network',
    network,
    '--env-file',
    join(directory, 'app.env'),
    imageIds.worker,
  ]);
  const failedExit = await privateRun(['wait', unready], 15000);
  assert.notEqual(
    failedExit,
    '0',
    'Unmigrated worker must refuse to process jobs',
  );
  await privateRun(
    [
      'run',
      '--rm',
      ...hardened,
      '--network',
      network,
      '--env-file',
      join(directory, 'app.env'),
      imageIds.worker,
      'node',
      'dist/migrate.js',
    ],
    60000,
  );
  await eventually(
    async () => (await health()).status === 200,
    'migrated web ready',
  );
  const ready = await health();
  assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ready.json(), { status: 'ready' });
  assert.equal(await docker(['exec', web, 'id', '-u']), '1000');
  await privateRun([
    'exec',
    web,
    'node',
    '-e',
    "const fs=require('node:fs');if(fs.existsSync('/app/.env.local'))process.exit(1);try{fs.writeFileSync('/app/proof-write','x');process.exit(1)}catch(e){if(e.code!=='EROFS'&&e.code!=='EACCES')process.exit(1)}",
  ]);
  const original = await sql(
    "SELECT checksum FROM fantasy.schema_migrations WHERE id='0001-core'",
  );
  assert.match(original, /^[a-f0-9]{64}$/u);
  await sql(
    "UPDATE fantasy.schema_migrations SET checksum='proof-changed' WHERE id='0001-core'",
  );
  assert.equal((await health()).status, 503);
  await sql(
    `UPDATE fantasy.schema_migrations SET checksum='${original}' WHERE id='0001-core'`,
  );
  assert.equal((await health()).status, 200);
  assert.equal((await fetch(`${base}/ar`)).status, 200);
  // A clean deployment has no published competition yet; guides must still render.
  for (const locale of ['ar', 'en']) {
    for (const guide of ['how-to-play', 'playbook']) {
      const response = await fetch(`${base}/${locale}/${guide}`, {
        signal: AbortSignal.timeout(6000),
      });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(`lang="${locale}"`));
      assert.ok(html.includes(locale === 'ar' ? 'ابدأ هنا' : 'Start here'));
    }
    const handbook = await fetch(`${base}/${locale}/admin/how-to`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    assert.equal(handbook.status, 307);
    assert.ok(handbook.headers.get('location')?.includes(`/${locale}/login`));
  }

  const logo = await fetch(`${base}/brand/3bont-fantasy-en-light.png`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type') ?? '', /^image\/png/u);
  containers.push(worker);
  await privateRun([
    'run',
    '--detach',
    '--name',
    worker,
    '--label',
    'fantasy-platform-purpose=container-proof',
    ...hardened,
    '--network',
    network,
    '--env-file',
    join(directory, 'app.env'),
    imageIds.worker,
  ]);
  await eventually(
    async () =>
      Number(
        await sql(
          "SELECT count(*) FROM fantasy.worker_runs WHERE task='game-cycle' AND status='ok'",
        ),
      ) > 0,
    'durable worker cycle',
  );
  await eventually(
    async () =>
      Number(
        await sql(
          "SELECT count(*) FROM fantasy.worker_runs WHERE task='provider-collection' AND status='ok' AND summary->'counts'->>'providerAutomationEnabled'='0'",
        ),
      ) > 0,
    'provider automation disabled by default',
  );
  assert.equal(await docker(['exec', worker, 'id', '-u']), '1000');
  await docker(['stop', '--time', '20', worker], 30000);
  assert.equal(
    await docker(['inspect', '--format', '{{.State.ExitCode}}', worker]),
    '0',
  );
  await mkdir('artifacts/verification', { recursive: true });
  await writeFile(
    'artifacts/verification/container-proof.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        images,
        checks: [
          'unmigrated web unavailable',
          'unmigrated worker refused',
          'migration command',
          'ready response and no-store',
          'changed checksum unavailable',
          'non-root web and worker',
          'read-only web filesystem',
          'Arabic page and PNG asset',
          'bilingual guides with no published competition and protected admin handbook',
          'durable game-cycle job',
          'provider automation disabled by default',
          'graceful worker shutdown',
        ],
        environment:
          'Isolated local Docker database and network; no live mail or provider traffic',
        limitations: [
          'No production deployment',
          'No off-host restoration or load benchmark',
          'Source checkout has no committed release revision',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Isolated Linux containers passed: non-root/read-only web and worker, blocked unmigrated startup, migrations, ready/unavailable checksums, Arabic page, PNG asset, durable jobs and graceful shutdown. No live mail or provider traffic.',
  );
} catch (error) {
  const diagnostics = [];
  for (const name of containers) {
    const log = await docker(['logs', '--tail', '35', name]).catch(
      () => 'Container log unavailable',
    );
    const state = await docker([
      'inspect',
      '--format',
      '{{.State.Status}} exit={{.State.ExitCode}}',
      name,
    ]).catch(() => 'Container state unavailable');
    diagnostics.push(`${name}: ${state}\n${log}`);
  }
  let text = diagnostics.join('\n');
  for (const secret of secretValues)
    text = text.split(secret).join('[redacted]');
  await mkdir('.local', { recursive: true });
  await writeFile('.local/container-proof-diagnostics.log', text, {
    mode: 0o600,
  });
  throw error;
} finally {
  for (const name of containers.reverse())
    await docker(['rm', '--force', name]).catch(() => {});
  if (networkCreated) await docker(['network', 'rm', network]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
