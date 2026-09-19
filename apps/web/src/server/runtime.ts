import { Pool } from 'pg';
import { createDatabase } from '@fantasy/persistence';
import {
  createIdentity,
  localMailTransport,
  parseApplicationConfiguration,
  resendMailTransport,
} from '@fantasy/application';

function createRuntime() {
  const config = parseApplicationConfiguration(process.env);
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 3000,
    application_name: '3bont-fantasy-web',
  });
  const sendMail =
    config.MAIL_MODE === 'local'
      ? localMailTransport(config.MAIL_OUTBOX_DIR)
      : resendMailTransport(config.RESEND_API_KEY ?? '', config.MAIL_FROM);
  const auth = createIdentity(pool, {
    baseURL: config.APP_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    secureCookies: config.APP_ENV === 'production',
    sendMail,
  });
  return { config, pool, db: createDatabase(pool), auth };
}

let runtime: ReturnType<typeof createRuntime> | undefined;
export function getRuntime(): ReturnType<typeof createRuntime> {
  runtime ??= createRuntime();
  return runtime;
}
