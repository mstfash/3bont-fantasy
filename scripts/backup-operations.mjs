import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
const execute = promisify(execFile);

/** A successful archive check is required separately; backup metadata alone cannot prove WAL continuity. */
export function assessBackupInformation(value, now = Date.now()) {
  const unavailable = {
    status: 'unavailable',
    code: 'backup-evidence-invalid',
  };
  if (!Array.isArray(value) || value.length !== 1) return unavailable;
  const stanza = value[0];
  if (
    stanza?.name !== 'fantasy' ||
    stanza.status?.code !== 0 ||
    stanza.cipher !== 'aes-256-cbc' ||
    !Array.isArray(stanza.backup)
  )
    return unavailable;
  if (
    stanza.backup.some(
      (backup) =>
        !backup || typeof backup !== 'object' || Array.isArray(backup),
    )
  )
    return unavailable;
  if (!stanza.backup.some((backup) => backup.type === 'full'))
    return { status: 'unavailable', code: 'full-backup-missing' };
  const stops = stanza.backup.map((backup) => backup.timestamp?.stop);
  if (
    stops.some(
      (stop) =>
        typeof stop !== 'number' ||
        !Number.isSafeInteger(stop) ||
        stop <= 0 ||
        stop * 1000 > now,
    )
  )
    return unavailable;
  const newest = Math.max(...stops) * 1000;
  if (now - newest > 26 * 3600000)
    return { status: 'unavailable', code: 'backup-too-old' };
  return {
    status: 'ready',
    newestBackupAt: new Date(newest).toISOString(),
    checkedAt: new Date(now).toISOString(),
  };
}

async function main() {
  const [action, release, ...extra] = process.argv.slice(2);
  const commands = {
    init: ['stanza-create'],
    check: ['check'],
    full: ['--type=full', 'backup'],
    diff: ['--type=diff', 'backup'],
    verify: ['verify'],
    'expire-preview': ['--dry-run', 'expire'],
  };
  if (
    extra.length ||
    !release ||
    !isAbsolute(release) ||
    (!Object.hasOwn(commands, action) && action !== 'status')
  )
    throw new Error(
      'Usage: node scripts/backup-operations.mjs <init|check|full|diff|status|verify|expire-preview> /absolute/release.env',
    );
  const compose = fileURLToPath(
    new URL('../infrastructure/production.compose.yml', import.meta.url),
  );
  async function run(args) {
    try {
      return (
        await execute(
          'docker',
          [
            'compose',
            '--env-file',
            release,
            '-f',
            compose,
            'exec',
            '-T',
            '--user',
            'postgres',
            'postgres',
            'pgbackrest',
            '--stanza=fantasy',
            ...args,
          ],
          {
            timeout:
              action === 'status' || action === 'check' ? 120000 : 4 * 3600000,
            maxBuffer: 8 * 1024 * 1024,
          },
        )
      ).stdout;
    } catch {
      throw new Error(
        'Backup operation failed. Inspect the private service logs and repository health; command output was withheld.',
      );
    }
  }
  if (action === 'status') {
    await run(['check']);
    let information;
    try {
      information = JSON.parse(await run(['--output=json', 'info']));
    } catch {
      throw new Error('Backup information could not be validated.');
    }
    const status = assessBackupInformation(information);
    console.log(JSON.stringify({ ...status, archivalConfirmed: true }));
    if (status.status !== 'ready') process.exitCode = 1;
  } else {
    await run(commands[action]);
    console.log(`Backup operation completed: ${action}`);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Backup operation failed',
    );
    process.exitCode = 1;
  }
}
