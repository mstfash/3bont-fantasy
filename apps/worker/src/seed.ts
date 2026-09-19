import { Pool } from 'pg';
import { createDatabase } from '@fantasy/persistence';
import { parseApplicationConfiguration, seedDemo } from '@fantasy/application';

const config = parseApplicationConfiguration(process.env);
if (
  config.APP_ENV !== 'local' ||
  new URL(config.DATABASE_URL).hostname !== '127.0.0.1'
)
  throw new Error('Demo seed is restricted to the local database');
const db = createDatabase(
  new Pool({ connectionString: config.DATABASE_URL, max: 1 }),
);
try {
  process.stdout.write(
    `Synthetic demo ${await seedDemo(db)}. /ar/competitions/cairo-demo\n`,
  );
} finally {
  await db.destroy();
}
