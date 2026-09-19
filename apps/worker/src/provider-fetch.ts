import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { z } from 'zod';
import { createDatabase } from '@fantasy/persistence';
import { providerRequestSchema } from '@fantasy/contracts';
import { fetchProviderResource, CommandRejected } from '@fantasy/application';
const path = process.argv[2];
if (!path)
  throw new Error(
    'Provide a JSON request file. Every page and retry consumes verified quota.',
  );
const request = providerRequestSchema.parse(
  JSON.parse(await readFile(path, 'utf8')),
);
const priority = z
  .enum(['ordinary', 'correction'])
  .parse(process.argv[3] ?? 'ordinary');
const configuration = z
  .object({
    DATABASE_URL: z.url(),
    API_FOOTBALL_KEY: z.string().min(10),
  })
  .parse(process.env);
const pool = new Pool({ connectionString: configuration.DATABASE_URL, max: 2 }),
  db = createDatabase(pool);
try {
  const account = await db
    .selectFrom('provider_accounts')
    .select('id')
    .where('provider', '=', 'api-football-direct')
    .executeTakeFirst();
  if (!account) throw new CommandRejected('provider-unavailable');
  const result = await fetchProviderResource(db, {
    accountId: account.id,
    request,
    priority,
    apiKey: configuration.API_FOOTBALL_KEY,
  });
  console.info(result);
  if (result.outcome !== 'success') process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof CommandRejected ? error.code : 'provider-fetch-failed',
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
