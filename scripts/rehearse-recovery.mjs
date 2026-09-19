import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import pg from '../packages/persistence/node_modules/pg/lib/index.js';
import {
  createDatabase,
  migrateApplication,
  applicationSchemaReady,
} from '../packages/persistence/dist/index.js';
import {
  createIdentity,
  migrateIdentity,
  seedDemoReplay,
} from '../packages/application/dist/index.js';
import { pauseProviderTrafficAfterRestore } from '../packages/application/dist/provider-query.js';
import { assessBackupInformation } from './backup-operations.mjs';

// No environment file is loaded. Every resource and credential belongs to this disposable drill.
const execute = promisify(execFile);
const suffix = randomBytes(6).toString('hex');
const prefix = `3bont-recovery-${suffix}`;
const image = '3bont-fantasy-postgres:local-proof';
const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
const password = randomBytes(32).toString('hex');
const cipher = randomBytes(32).toString('hex');
const source = `${prefix}-source`,
  restored = `${prefix}-restored`,
  incomplete = `${prefix}-incomplete`;
const sourceVolume = `${prefix}-source-data`,
  restoredVolume = `${prefix}-restored-data`,
  repoVolume = `${prefix}-repository`,
  incompleteVolume = `${prefix}-incomplete-data`,
  incompleteRepo = `${prefix}-incomplete-repository`;
const containers = [],
  volumes = [];
const pools = [];
const configuration = (pass) =>
  `[global]\nrepo1-type=posix\nrepo1-path=/backup\nrepo1-cipher-type=aes-256-cbc\nrepo1-cipher-pass=${pass}\nrepo1-retention-full-type=time\nrepo1-retention-full=30\nstart-fast=y\nprocess-max=2\narchive-timeout=60\nlog-level-console=warn\nlog-level-file=off\n[fantasy]\npg1-path=/var/lib/postgresql/data\npg1-socket-path=/var/run/postgresql\npg1-user=fantasy\npg1-database=fantasy_backup_proof\n`;
async function docker(args, timeout = 60000) {
  try {
    return (
      await execute('docker', args, { timeout, maxBuffer: 8 * 1024 * 1024 })
    ).stdout.trim();
  } catch {
    throw new Error(
      'A disposable recovery operation failed. Command output and credentials were not disclosed.',
    );
  }
}
async function connect(container) {
  const port = /^127\.0\.0\.1:(\d+)$/u.exec(
    await docker(['port', container, '5432/tcp']),
  )?.[1];
  assert.ok(port, 'Database must bind only to loopback');
  const pool = new pg.Pool({
    host: '127.0.0.1',
    port: Number(port),
    user: 'fantasy',
    password,
    database: 'fantasy_backup_proof',
    max: 4,
    connectionTimeoutMillis: 1000,
  });
  pools.push(pool);
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (
        !(await pool.query('SELECT pg_is_in_recovery() AS recovering')).rows[0]
          .recovering
      )
        return pool;
    } catch {
      /* startup may still be recovering */
    }
    await setTimeout(500);
  }
  throw new Error('Restored database did not become ready');
}
const configMount = (file = 'pgbackrest.conf') => [
  '--mount',
  `type=bind,src=${join(directory, file)},dst=/run/secrets/pgbackrest_config,readonly`,
];
const backrest = (container, args) =>
  docker(
    [
      'exec',
      '--user',
      'postgres',
      container,
      'pgbackrest',
      '--stanza=fantasy',
      ...args,
    ],
    120000,
  );
async function scores(pool) {
  return (
    await pool.query(
      "SELECT count(*)::integer AS count,md5(coalesce(string_agg(payload::text,'' ORDER BY entry_id,gameweek_id,revision),'')) AS checksum FROM fantasy.entry_results",
    )
  ).rows[0];
}
try {
  await assert.rejects(
    docker([
      'run',
      '--rm',
      '--network',
      'none',
      image,
      'pgbackrest',
      'version',
    ]),
  );
  await writeFile(
    join(directory, 'database.env'),
    `POSTGRES_USER=fantasy\nPOSTGRES_DB=fantasy_backup_proof\nPOSTGRES_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  await writeFile(join(directory, 'pgbackrest.conf'), configuration(cipher), {
    mode: 0o600,
  });
  await writeFile(
    join(directory, 'wrong.conf'),
    configuration(randomBytes(32).toString('hex')),
    { mode: 0o600 },
  );
  for (const volume of [
    sourceVolume,
    restoredVolume,
    repoVolume,
    incompleteVolume,
    incompleteRepo,
  ]) {
    await docker([
      'volume',
      'create',
      '--label',
      'fantasy-platform-purpose=recovery-test',
      volume,
    ]);
    volumes.push(volume);
  }
  await docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    'sh',
    '-v',
    `${restoredVolume}:/restored`,
    '-v',
    `${repoVolume}:/backup`,
    image,
    '-c',
    'chown postgres:postgres /restored /backup && chmod 0700 /restored /backup',
  ]);
  await docker([
    'run',
    '-d',
    '--name',
    source,
    '--label',
    'fantasy-platform-purpose=recovery-test',
    '--memory',
    '768m',
    '--cpus',
    '1',
    '--env-file',
    join(directory, 'database.env'),
    ...configMount(),
    '-v',
    `${sourceVolume}:/var/lib/postgresql/data`,
    '-v',
    `${repoVolume}:/backup`,
    '-p',
    '127.0.0.1::5432',
    image,
    'postgres',
    '-c',
    'archive_mode=on',
    '-c',
    'archive_timeout=60',
    '-c',
    'archive_command=pgbackrest --stanza=fantasy archive-push %p',
  ]);
  containers.push(source);
  const sourcePool = await connect(source),
    db = createDatabase(sourcePool);
  await migrateIdentity(
    createIdentity(sourcePool, {
      baseURL: 'http://127.0.0.1:3100',
      secret: randomBytes(32).toString('hex'),
      secureCookies: false,
      sendMail: async () => {
        throw new Error('Mail is disabled in recovery rehearsals');
      },
    }),
  );
  await migrateApplication(sourcePool);
  await seedDemoReplay(db);
  const expectedScores = await scores(sourcePool);
  assert.ok(
    expectedScores.count > 0,
    'The backup must contain published fantasy results',
  );
  const accountId = randomUUID();
  await sourcePool.query(
    'INSERT INTO fantasy.provider_accounts(id,provider,revision,data) VALUES($1,$2,1,$3)',
    [
      accountId,
      'api-football-direct',
      {
        id: accountId,
        provider: 'api-football-direct',
        revision: 1,
        state: 'enabled',
        dailyLimit: 100,
        minuteLimit: 10,
        resetAnchor: new Date().toISOString(),
        evidenceReference: 'Synthetic recovery gate only',
        dedicatedKeyConfirmed: true,
        reconciledAt: new Date().toISOString(),
      },
    ],
  );
  await sourcePool.query(
    'CREATE TABLE fantasy.recovery_markers(id text PRIMARY KEY)',
  );
  await sourcePool.query(
    "INSERT INTO fantasy.recovery_markers VALUES ('base-backup')",
  );
  await backrest(source, ['stanza-create']);
  await backrest(source, ['check']);
  await backrest(source, ['--type=full', 'backup']);
  const info = JSON.parse(await backrest(source, ['--output=json', 'info']));
  assert.equal(info[0].status.code, 0);
  assert.equal(info[0].cipher, 'aes-256-cbc');
  assert.equal(info[0].backup.length, 1);
  assert.equal(assessBackupInformation(info).status, 'ready');
  const backupLabel = info[0].backup[0].label;
  await sourcePool.query(
    "INSERT INTO fantasy.recovery_markers VALUES ('wal-only')",
  );
  const recoveryPoint = `3bont_${suffix}`;
  const targetWal = (
    await sourcePool.query(
      'SELECT pg_walfile_name(pg_create_restore_point($1)) AS wal',
      [recoveryPoint],
    )
  ).rows[0].wal;
  assert.match(targetWal, /^[A-F0-9]{24}$/u);
  await sourcePool.query(
    "INSERT INTO fantasy.recovery_markers VALUES ('after-target')",
  );
  await backrest(source, ['check']);
  const sourceVersion = (await sourcePool.query('SHOW server_version')).rows[0]
    .server_version;
  await sourcePool.end();
  pools.splice(pools.indexOf(sourcePool), 1);
  const recoveryStarted = performance.now();
  await docker(['stop', '--time', '20', source]);
  await docker(['rm', source]);
  containers.splice(containers.indexOf(source), 1);
  // Only this run's labelled source volume is removed; restored data cannot rely on the original host volume.
  assert.equal(
    await docker([
      'volume',
      'inspect',
      sourceVolume,
      '--format',
      '{{index .Labels "fantasy-platform-purpose"}}',
    ]),
    'recovery-test',
  );
  await docker(['volume', 'rm', sourceVolume]);
  volumes.splice(volumes.indexOf(sourceVolume), 1);
  const missingFiles = await docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    'sh',
    '-v',
    `${repoVolume}:/original:ro`,
    '-v',
    `${incompleteRepo}:/broken`,
    '-v',
    `${incompleteVolume}:/restored`,
    image,
    '-c',
    'cp -a /original/. /broken/ && chown postgres:postgres /broken /restored && chmod 0700 /restored && find /broken/archive -type f -name "$1-*" -print -delete',
    '--',
    targetWal,
  ]);
  assert.ok(
    missingFiles.includes(targetWal),
    'The negative drill must remove the selected target WAL',
  );
  await docker(
    [
      'run',
      '--rm',
      '--network',
      'none',
      '-v',
      `${incompleteVolume}:/var/lib/postgresql/data`,
      '-v',
      `${incompleteRepo}:/backup:ro`,
      ...configMount(),
      image,
      'pgbackrest',
      '--stanza=fantasy',
      '--type=name',
      `--target=${recoveryPoint}`,
      '--target-action=promote',
      `--set=${backupLabel}`,
      '--archive-mode=off',
      'restore',
    ],
    120000,
  );
  await docker([
    'run',
    '-d',
    '--name',
    incomplete,
    '--label',
    'fantasy-platform-purpose=recovery-test',
    '--env-file',
    join(directory, 'database.env'),
    ...configMount(),
    '-v',
    `${incompleteVolume}:/var/lib/postgresql/data`,
    '-v',
    `${incompleteRepo}:/backup:ro`,
    '-p',
    '127.0.0.1::5432',
    image,
  ]);
  containers.push(incomplete);
  await assert.rejects(
    connect(incomplete),
    /Restored database did not become ready/u,
  );
  const restoreArgs = [
    'run',
    '--rm',
    '--network',
    'none',
    '-v',
    `${restoredVolume}:/var/lib/postgresql/data`,
    '-v',
    `${repoVolume}:/backup:ro`,
  ];
  await assert.rejects(
    docker(
      [
        ...restoreArgs,
        ...configMount('wrong.conf'),
        image,
        'pgbackrest',
        '--stanza=fantasy',
        '--type=name',
        `--target=${recoveryPoint}`,
        '--target-action=promote',
        `--set=${backupLabel}`,
        '--archive-mode=off',
        'restore',
      ],
      120000,
    ),
  );
  await docker(
    [
      ...restoreArgs,
      ...configMount(),
      image,
      'pgbackrest',
      '--stanza=fantasy',
      '--type=name',
      `--target=${recoveryPoint}`,
      '--target-action=promote',
      `--set=${backupLabel}`,
      '--archive-mode=off',
      'restore',
    ],
    120000,
  );
  await docker([
    'run',
    '-d',
    '--name',
    restored,
    '--label',
    'fantasy-platform-purpose=recovery-test',
    '--memory',
    '768m',
    '--cpus',
    '1',
    '--env-file',
    join(directory, 'database.env'),
    ...configMount(),
    '-v',
    `${restoredVolume}:/var/lib/postgresql/data`,
    '-v',
    `${repoVolume}:/backup:ro`,
    '-p',
    '127.0.0.1::5432',
    image,
  ]);
  containers.push(restored);
  const restoredPool = await connect(restored);
  assert.equal(await applicationSchemaReady(restoredPool), true);
  assert.deepEqual(
    (
      await restoredPool.query(
        'SELECT id FROM fantasy.recovery_markers ORDER BY id',
      )
    ).rows.map((r) => r.id),
    ['base-backup', 'wal-only'],
  );
  assert.deepEqual(await scores(restoredPool), expectedScores);
  assert.equal(
    (await restoredPool.query('SELECT pg_is_in_recovery() AS recovering'))
      .rows[0].recovering,
    false,
  );
  assert.equal(
    (await restoredPool.query('SHOW archive_mode')).rows[0].archive_mode,
    'off',
  );
  await pauseProviderTrafficAfterRestore(createDatabase(restoredPool));
  assert.equal(
    (
      await restoredPool.query(
        'SELECT data FROM fantasy.provider_accounts WHERE id=$1',
        [accountId],
      )
    ).rows[0].data.state,
    'paused',
  );
  const proof = {
    date: new Date().toISOString(),
    postgresVersion: sourceVersion,
    pgBackRestVersion: await docker([
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'pgbackrest',
      image,
      'version',
    ]),
    imageId: await docker(['image', 'inspect', image, '--format', '{{.Id}}']),
    status: 'passed',
    providerRequests: 0,
    originalVolumeRemoved: true,
    encryptedRepository: true,
    wrongKeyRejected: true,
    missingConfigurationRejected: true,
    missingWalRejected: true,
    walOnlyTransactionRecovered: true,
    afterTargetTransactionExcluded: true,
    restoredScores: expectedScores.count,
    scoreChecksumPreserved: true,
    schemaReady: true,
    providerPausedBeforeRestart: true,
    recoverySeconds: Math.round((performance.now() - recoveryStarted) / 1000),
    boundary:
      'Disposable local volumes, not off-host S3 evidence or production-sized RPO/RTO measurement.',
    sources: await Promise.all(
      [
        'infrastructure/postgres/Dockerfile',
        'infrastructure/postgres/backup-entrypoint.sh',
        'infrastructure/postgres/pgbackrest.conf.example',
        'infrastructure/production.compose.yml',
        'scripts/build-backup-image.mjs',
        'scripts/backup-operations.mjs',
        'scripts/rehearse-recovery.mjs',
        'scripts/tests/backup-status.test.mjs',
        'packages/persistence/src/migrate.ts',
        'packages/persistence/tests/postgres.test.ts',
      ].map(async (path) => ({
        path,
        sha256: createHash('sha256')
          .update(await readFile(new URL(`../${path}`, import.meta.url)))
          .digest('hex'),
      })),
    ),
  };
  await mkdir('artifacts/verification', { recursive: true });
  await writeFile(
    'artifacts/verification/recovery-proof.json',
    JSON.stringify(proof, null, 2) + '\n',
  );
  console.log(
    `Encrypted recovery passed: ${proof.restoredScores} published results preserved, WAL-only transaction recovered, later transaction excluded, wrong key and missing WAL rejected, provider paused; ${proof.recoverySeconds}s local drill including failure checks.`,
  );
} finally {
  await Promise.allSettled(pools.map((pool) => pool.end()));
  const removedContainers = await Promise.allSettled(
    containers.reverse().map((name) => docker(['rm', '--force', name])),
  );
  const removedVolumes = await Promise.allSettled(
    volumes.reverse().map((name) => docker(['volume', 'rm', name])),
  );
  await rm(directory, { recursive: true, force: true });
  if (
    [...removedContainers, ...removedVolumes].some(
      (result) => result.status === 'rejected',
    )
  )
    throw new Error(
      'Some disposable recovery resources could not be removed; inspect resources labelled recovery-test.',
    );
}
