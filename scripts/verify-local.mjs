import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { loadEnvFile } from 'node:process';
import { setTimeout } from 'node:timers/promises';

const root = new URL('../', import.meta.url);
const base = 'http://127.0.0.1:3100';
loadEnvFile(new URL('.env.local', root));
if (
  process.env.APP_ENV !== 'local' ||
  process.env.MAIL_MODE !== 'local' ||
  new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error(
    'Verification requires local-only application, mail and PostgreSQL settings',
  );
const controller = new AbortController();
const interrupted = () => controller.abort();
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);

async function ensureFreePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new Error(
          'Port 3100 is occupied. Stop the local preview and worker before verification; no existing process was stopped.',
        ),
      ),
    );
    probe.listen(3100, '127.0.0.1', () => probe.close(resolve));
  });
}

async function run(script) {
  controller.signal.throwIfAborted();
  console.log(`Verification stage: pnpm ${script}`);
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', [script], {
      cwd: root,
      stdio: 'inherit',
      signal: controller.signal,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Verification failed: ${script}`)),
    );
  });
}

let preview;
let previewStopped;
let log;
try {
  // Check before any build: rebuilding a live standalone directory can interrupt its assets.
  await ensureFreePort();
  console.log(
    'Local verification requires the background worker to be stopped; fixtures control deadlines directly.',
  );
  await run('check');
  await run('test:integration');
  await ensureFreePort();
  await mkdir(new URL('.local/verification/', root), {
    recursive: true,
    mode: 0o700,
  });
  log = await open(
    new URL('.local/verification/preview.log', root),
    'w',
    0o600,
  );
  preview = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd: new URL('apps/web/', root),
    env: { ...process.env, PORT: '3100' },
    stdio: ['ignore', log.fd, log.fd],
  });
  let spawnFailed = false;
  previewStopped = new Promise((resolve) => {
    preview.once('exit', resolve);
    preview.once('error', () => {
      spawnFailed = true;
      resolve();
    });
  });
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    controller.signal.throwIfAborted();
    if (spawnFailed || preview.exitCode !== null || preview.signalCode !== null)
      throw new Error(
        'The verification preview exited before readiness. Its private log was not printed.',
      );
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === 'ready') {
        ready = true;
        break;
      }
    } catch {
      /* Startup can refuse connections until the HTTP listener is ready. */
    }
    await setTimeout(1000, undefined, { signal: controller.signal });
  }
  if (!ready)
    throw new Error(
      'Local preview did not become database-ready within the startup window.',
    );
  await run('test:smoke');
  await run('test:e2e');
  console.log(
    'Local verification passed: strict build/unit/harness checks, isolated integrations, public smoke and authenticated E2E.',
  );
} finally {
  if (preview && preview.exitCode === null && preview.signalCode === null) {
    preview.kill('SIGTERM');
    const timeout = globalThis.setTimeout(
      () => preview.kill('SIGKILL'),
      10_000,
    );
    await previewStopped;
    clearTimeout(timeout);
  }
  await log?.close();
  process.removeListener('SIGINT', interrupted);
  process.removeListener('SIGTERM', interrupted);
}
