import { Pool } from 'pg';
import { migrateApplication } from '@fantasy/persistence';
import {
  createIdentity,
  localMailTransport,
  migrateIdentity,
  parseApplicationConfiguration,
  resendMailTransport,
} from '@fantasy/application';

const config = parseApplicationConfiguration(process.env);
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 3,
  application_name: '3bont-fantasy-migrate',
});
try {
  const identity = createIdentity(pool, {
    baseURL: config.APP_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    secureCookies: config.APP_ENV === 'production',
    sendMail:
      config.MAIL_MODE === 'local'
        ? localMailTransport(config.MAIL_OUTBOX_DIR)
        : resendMailTransport(config.RESEND_API_KEY ?? '', config.MAIL_FROM),
  });
  await migrateIdentity(identity);
  await migrateApplication(pool);
  console.info('Identity and application migrations completed');
} finally {
  await pool.end();
}
