import { Pool } from 'pg';
import { z } from 'zod';
import { createDatabase } from '@fantasy/persistence';
import { pauseProviderTrafficAfterRestore } from '@fantasy/application';
const databaseURL = z.url().parse(process.env['DATABASE_URL']);
const db = createDatabase(new Pool({ connectionString: databaseURL, max: 1 }));
try {
  console.info({
    pausedProviderAccounts: await pauseProviderTrafficAfterRestore(db),
  });
} finally {
  await db.destroy();
}
