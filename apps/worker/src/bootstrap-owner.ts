import { Pool } from 'pg';
import { createDatabase } from '@fantasy/persistence';
import {
  bootstrapOwner,
  parseApplicationConfiguration,
} from '@fantasy/application';

const email = process.argv[2];
if (!email)
  throw new Error(
    'Usage: pnpm --filter @fantasy/worker owner:bootstrap verified-email@example.com',
  );
const config = parseApplicationConfiguration(process.env);
const db = createDatabase(
  new Pool({ connectionString: config.DATABASE_URL, max: 1 }),
);
try {
  console.info(
    `First owner ${await bootstrapOwner(db, email)}. Verify the current session at /ar/security before opening /ar/admin.`,
  );
} finally {
  await db.destroy();
}
