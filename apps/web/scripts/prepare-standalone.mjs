import { cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('.next/standalone/apps/web/', root);
await mkdir(new URL('.next/', output), { recursive: true });
await cp(new URL('public/', root), new URL('public/', output), {
  recursive: true,
  force: true,
});
await cp(new URL('.next/static/', root), new URL('.next/static/', output), {
  recursive: true,
  force: true,
});
