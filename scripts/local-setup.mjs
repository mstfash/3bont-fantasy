import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = join(root, '.env.local');
try {
  await access(envPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const password = randomBytes(24).toString('hex');
  await writeFile(
    envPath,
    [
      'APP_ENV=local',
      'APP_BASE_URL=http://127.0.0.1:3100',
      'POSTGRES_PORT=54329',
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://fantasy:${password}@127.0.0.1:54329/fantasy`,
      `BETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}`,
      'MAIL_MODE=local',
      `MAIL_OUTBOX_DIR=${JSON.stringify(join(root, '.local', 'mail'))}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
}
const config = parseEnv(await readFile(envPath, 'utf8'));
if (
  config.APP_ENV !== 'local' ||
  new URL(config.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('Local setup refuses a non-local configuration');
await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
}
await run('docker', [
  'compose',
  '--env-file',
  envPath,
  '-f',
  'infrastructure/local.compose.yml',
  'up',
  '-d',
  '--wait',
]);
await run('pnpm', ['db:migrate']);
console.info(
  'Local database and identity schema ready. Start the app with pnpm dev.',
);
