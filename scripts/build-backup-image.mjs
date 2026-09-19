import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = fileURLToPath(
  new URL('../infrastructure/postgres/', import.meta.url),
);
const context = await mkdtemp(join(tmpdir(), '3bont-backup-build-'));
try {
  // Never send a private configuration accidentally placed beside the image recipe to the builder.
  for (const file of ['Dockerfile', 'backup-entrypoint.sh'])
    await cp(join(source, file), join(context, file));
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['build', '--tag', '3bont-fantasy-postgres:local-proof', context],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await rm(context, { recursive: true, force: true });
}
