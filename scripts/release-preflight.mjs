import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateReleaseConfiguration(
  release,
  web,
  worker,
  databasePassword,
) {
  requireValue(
    typeof release.APP_HOST === 'string' &&
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
        release.APP_HOST,
      ) &&
      !/\.(?:test|invalid|localhost|local)$/u.test(release.APP_HOST),
    'APP_HOST must be one public DNS hostname, without a scheme, port or path.',
  );
  for (const key of ['WEB_IMAGE', 'WORKER_IMAGE', 'POSTGRES_IMAGE']) {
    requireValue(
      typeof release[key] === 'string' &&
        /^[a-z0-9][a-z0-9./_:-]*@sha256:[a-f0-9]{64}$/u.test(release[key]),
      `${key} must reference an immutable registry image digest.`,
    );
  }
  requireValue(
    typeof release.SECRETS_DIR === 'string' && isAbsolute(release.SECRETS_DIR),
    'SECRETS_DIR must be an absolute private directory.',
  );
  requireValue(
    web.APP_BASE_URL === `https://${release.APP_HOST}`,
    'APP_BASE_URL must exactly match the proxy HTTPS origin without a trailing slash.',
  );
  requireValue(
    web.MAIL_MODE === 'resend' &&
      Boolean(web.RESEND_API_KEY) &&
      Boolean(web.MAIL_FROM) &&
      !/example\.(?:invalid|test|com)/u.test(web.MAIL_FROM),
    'Configure the production delivery transport and a verified sender.',
  );
  requireValue(
    typeof web.BETTER_AUTH_SECRET === 'string' &&
      web.BETTER_AUTH_SECRET.length >= 32 &&
      !web.BETTER_AUTH_SECRET.startsWith('REPLACE_'),
    'Configure a generated authentication secret.',
  );
  requireValue(
    !web.API_FOOTBALL_KEY,
    'Provider credentials belong only in the worker environment.',
  );
  requireValue(
    worker.API_FOOTBALL_AUTOMATION_ENABLED === 'false' ||
      worker.API_FOOTBALL_AUTOMATION_ENABLED === undefined ||
      worker.API_FOOTBALL_AUTOMATION_ENABLED === 'true',
    'Provider automation must be explicitly true or false.',
  );
  requireValue(
    worker.API_FOOTBALL_AUTOMATION_ENABLED !== 'true' ||
      Boolean(worker.API_FOOTBALL_KEY),
    'Enabled provider automation requires the private worker credential and separate coverage approval.',
  );
  requireValue(
    Boolean(databasePassword) && !/[\r\n]/u.test(databasePassword),
    'The database password must be a nonempty single line.',
  );
  for (const [name, environment] of [
    ['web', web],
    ['worker', worker],
  ]) {
    let url;
    try {
      url = new URL(environment.DATABASE_URL);
    } catch {
      throw new Error(`${name} DATABASE_URL is invalid.`);
    }
    requireValue(
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
        url.hostname === 'postgres' &&
        ['', '5432'].includes(url.port) &&
        url.username === 'fantasy' &&
        url.pathname === '/fantasy' &&
        !url.search &&
        !url.hash,
      `${name} DATABASE_URL must use the supplied stack's internal PostgreSQL service and fantasy role/database.`,
    );
    let decodedPassword;
    try {
      decodedPassword = decodeURIComponent(url.password);
    } catch {
      throw new Error(`${name} database password encoding is invalid.`);
    }
    requireValue(
      decodedPassword === databasePassword,
      `${name} database password does not match its secret mount.`,
    );
  }
  return {
    hostname: release.APP_HOST,
    providerAutomationEnabled:
      worker.API_FOOTBALL_AUTOMATION_ENABLED === 'true',
  };
}

async function readPrivate(path, directory = false) {
  const metadata = await lstat(path);
  requireValue(
    !metadata.isSymbolicLink() &&
      (directory ? metadata.isDirectory() : metadata.isFile()),
    'A private configuration path is missing, is a symlink or has the wrong file type.',
  );
  requireValue(
    (metadata.mode & 0o077) === 0 &&
      (metadata.uid === process.getuid() || metadata.uid === 0),
    'Private configuration must be owned by the operator/root with no group or other permissions.',
  );
  return directory ? undefined : readFile(path, 'utf8');
}

export async function releasePreflight(releasePath) {
  requireValue(
    typeof releasePath === 'string' && isAbsolute(releasePath),
    'Pass the absolute path to the private release environment file.',
  );
  const release = parseEnv(await readPrivate(releasePath));
  requireValue(
    typeof release.SECRETS_DIR === 'string' && isAbsolute(release.SECRETS_DIR),
    'SECRETS_DIR must be an absolute private directory.',
  );
  await readPrivate(release.SECRETS_DIR, true);
  const [webText, workerText, password, backup] = await Promise.all([
    readPrivate(join(release.SECRETS_DIR, 'web.env')),
    readPrivate(join(release.SECRETS_DIR, 'worker.env')),
    readPrivate(join(release.SECRETS_DIR, 'database-password')),
    readPrivate(join(release.SECRETS_DIR, 'pgbackrest.conf')),
  ]);
  requireValue(
    Boolean(backup.trim()),
    'The private backup configuration is empty.',
  );
  return validateReleaseConfiguration(
    release,
    parseEnv(webText),
    parseEnv(workerText),
    password.replace(/\r?\n$/u, ''),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await releasePreflight(process.argv[2]);
    console.log(
      `Release configuration preflight passed for ${result.hostname}. Provider automation: ${result.providerAutomationEnabled ? 'enabled; separate licensed coverage approval required' : 'paused'}.`,
    );
    console.log(
      'This read-only check does not verify DNS, image availability, mail delivery, backup access, capacity or production approval. Run Compose config --quiet and the staging drill next.',
    );
  } catch (error) {
    // Only our fixed validation messages are printable. Filesystem errors can
    // contain private paths; parse/read failures never disclose file content.
    const message =
      error instanceof Error && !('code' in error) && error.name === 'Error'
        ? error.message
        : 'Unable to read or parse private release configuration.';
    console.error(`Release preflight failed: ${message}`);
    process.exitCode = 1;
  }
}
