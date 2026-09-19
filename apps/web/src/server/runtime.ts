import {
  applicationSchemaReady,
  createDatabase,
  createManagedPool,
} from '@fantasy/persistence';
import {
  createIdentity,
  localMailTransport,
  parseApplicationConfiguration,
  resendMailTransport,
} from '@fantasy/application';

export class IdentityUnavailable extends Error {
  constructor() {
    super('Identity is not ready');
    this.name = 'IdentityUnavailable';
  }
}

function createRuntime() {
  const config = parseApplicationConfiguration(process.env);
  const pool = createManagedPool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 3000,
    application_name: '3bont-fantasy-web',
  });
  const sendMail =
    config.MAIL_MODE === 'local'
      ? localMailTransport(config.MAIL_OUTBOX_DIR)
      : resendMailTransport(config.RESEND_API_KEY ?? '', config.MAIL_FROM);
  let identity: Promise<ReturnType<typeof createIdentity>> | undefined;
  const getIdentity = (): Promise<ReturnType<typeof createIdentity>> => {
    identity ??= (async () => {
      if (!(await applicationSchemaReady(pool)))
        throw new IdentityUnavailable();
      const auth = createIdentity(pool, {
        baseURL: config.APP_BASE_URL,
        secret: config.BETTER_AUTH_SECRET,
        secureCookies: config.APP_ENV === 'production',
        sendMail,
      });
      await auth.$context;
      return auth;
    })().catch(() => {
      // A probe during startup must not permanently cache failed identity
      // initialization. Concurrent callers share one attempt; later calls retry.
      identity = undefined;
      throw new IdentityUnavailable();
    });
    return identity;
  };
  return { config, pool, db: createDatabase(pool), getIdentity };
}

let runtime: ReturnType<typeof createRuntime> | undefined;
export function getRuntime(): ReturnType<typeof createRuntime> {
  runtime ??= createRuntime();
  return runtime;
}
