import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const environment = new URL('../../../.env.local', import.meta.url);
if (existsSync(environment)) loadEnvFile(environment);
process.env.PORT = process.env.PORT ?? '3100';
process.env.HOSTNAME =
  process.env.APP_ENV === 'local' ? '127.0.0.1' : '0.0.0.0';
await import('../.next/standalone/apps/web/server.js');
