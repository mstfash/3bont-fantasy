import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

// Load before Next forks its dev server. Node's --env-file flag cannot be
// forwarded through NODE_OPTIONS, which Next uses for child processes.
const environment = new URL('../../../.env.local', import.meta.url);
if (existsSync(environment)) loadEnvFile(environment);
await import('next/dist/bin/next');
