import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Pool } from 'pg';
import { createDatabase } from '@fantasy/persistence';
import {
  parseApplicationConfiguration,
  seedHistoricalTestDraft,
} from '@fantasy/application';

const config = parseApplicationConfiguration(process.env);
if (
  config.APP_ENV !== 'local' ||
  new URL(config.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('Historical test setup is restricted to the local database');
const path = process.argv[2];
if (!path)
  throw new Error(
    'Provide a saved fixtures response file; this command never fetches data',
  );
const bytes = await readFile(path);
const source = z
  .object({ payload: z.unknown() })
  .parse(JSON.parse(bytes.toString('utf8')));
const db = createDatabase(
  new Pool({ connectionString: config.DATABASE_URL, max: 1 }),
);
try {
  const result = await seedHistoricalTestDraft(
    db,
    source.payload,
    createHash('sha256').update(bytes).digest('hex'),
  );
  console.info(
    JSON.stringify({
      ...result,
      adminPath: `/en/admin/competitions/${result.competitionId}`,
      status: 'draft',
      leagueId: 233,
      seasonYear: 2024,
      outboundRequests: 0,
    }),
  );
} finally {
  await db.destroy();
}
