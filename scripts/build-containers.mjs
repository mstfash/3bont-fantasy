import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(tmpdir(), '3bont-build-context-'));
const inputs = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'eslint.config.mjs',
  '.dockerignore',
  'infrastructure/Dockerfile',
  'apps/web/package.json',
  'apps/web/next.config.ts',
  'apps/web/next-env.d.ts',
  'apps/web/tsconfig.json',
  'apps/web/tsconfig.build.json',
  'apps/web/src',
  'apps/web/public',
  'apps/web/scripts/prepare-standalone.mjs',
  'apps/worker/package.json',
  'apps/worker/tsconfig.json',
  'apps/worker/src',
  ...['domain', 'contracts', 'persistence', 'application'].flatMap((name) =>
    ['package.json', 'tsconfig.json', 'src'].map(
      (file) => `packages/${name}/${file}`,
    ),
  ),
  'packages/typescript-config/package.json',
  'packages/typescript-config/base.json',
];
try {
  for (const path of inputs) {
    await mkdir(dirname(join(staging, path)), { recursive: true });
    await cp(join(root, path), join(staging, path), {
      recursive: true,
      dereference: false,
    });
  }
  for (const target of ['web', 'worker']) {
    const args = [
      'build',
      '--file',
      join(staging, 'infrastructure/Dockerfile'),
      '--target',
      target,
      '--tag',
      `3bont-fantasy-${target}:local-proof`,
    ];
    if (process.env.FANTASY_BUILD_NODE_IMAGE)
      args.push(
        '--build-arg',
        `NODE_IMAGE=${process.env.FANTASY_BUILD_NODE_IMAGE}`,
      );
    args.push(staging);
    const code = await new Promise((resolve, reject) => {
      const child = spawn('docker', args, { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (code !== 0) throw new Error(`The ${target} container build failed.`);
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
