import { Pool } from 'pg';
import { createDatabase } from '@fantasy/persistence';
import {
  parseApplicationConfiguration,
  seedDemoReplay,
} from '@fantasy/application';
const config = parseApplicationConfiguration(process.env);
if (
  config.APP_ENV !== 'local' ||
  new URL(config.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('Synthetic replay is local-only');
const db = createDatabase(
  new Pool({ connectionString: config.DATABASE_URL, max: 2 }),
);
try {
  await seedDemoReplay(db);
  console.info(
    'Synthetic replay ready: /ar/competitions/cairo-replay/standings',
  );
} finally {
  await db.destroy();
}
