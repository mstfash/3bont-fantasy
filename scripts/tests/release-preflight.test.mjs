import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  releasePreflight,
  validateReleaseConfiguration,
} from '../release-preflight.mjs';

function fixture() {
  const password = randomBytes(24).toString('base64url');
  const image = `ghcr.io/example/fantasy@sha256:${'a'.repeat(64)}`;
  const release = {
    APP_HOST: 'fantasy.operator.org',
    SECRETS_DIR: '/private/fantasy',
    WEB_IMAGE: image,
    WORKER_IMAGE: image,
    POSTGRES_IMAGE: image,
  };
  const web = {
    APP_BASE_URL: 'https://fantasy.operator.org',
    MAIL_MODE: 'resend',
    MAIL_FROM: 'Fantasy <mail@operator.org>',
    RESEND_API_KEY: randomBytes(24).toString('hex'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: `postgresql://fantasy:${password}@postgres:5432/fantasy`,
  };
  const worker = {
    DATABASE_URL: web.DATABASE_URL,
    API_FOOTBALL_AUTOMATION_ENABLED: 'false',
  };
  return { release, web, worker, password };
}

test('release preflight rejects mismatched TLS origins, mutable images and divergent database secrets', () => {
  const { release, web, worker, password } = fixture();
  const check = (r = release, w = web, k = worker, p = password) =>
    validateReleaseConfiguration(r, w, k, p);
  assert.equal(check().providerAutomationEnabled, false);
  for (const host of [
    'http://fantasy.operator.org',
    'localhost',
    '*.operator.org',
    'fantasy.operator.org,evil.org',
    'fantasy.operator.org\n:80',
    'fantasy.example.test',
  ])
    assert.throws(() => check({ ...release, APP_HOST: host }), /hostname/u);
  assert.throws(
    () =>
      check(release, { ...web, APP_BASE_URL: 'https://other.operator.org' }),
    /origin/u,
  );
  for (const key of ['WEB_IMAGE', 'WORKER_IMAGE', 'POSTGRES_IMAGE'])
    assert.throws(
      () => check({ ...release, [key]: 'ghcr.io/example/fantasy:latest' }),
      /immutable/u,
    );
  assert.throws(
    () =>
      check(release, web, {
        ...worker,
        DATABASE_URL: worker.DATABASE_URL.replace('@postgres', '@external'),
      }),
    /internal/u,
  );
  assert.throws(
    () => check(release, web, worker, randomBytes(24).toString('hex')),
    /match/u,
  );
  assert.throws(
    () => check(release, { ...web, API_FOOTBALL_KEY: 'synthetic' }),
    /worker/u,
  );
});

test('release preflight reads private files and rejects group-readable credentials without printing values', async () => {
  const directory = await mkdtemp(join(tmpdir(), '3bont-release-proof-'));
  try {
    const { release, web, worker, password } = fixture();
    const secrets = join(directory, 'secrets');
    await mkdir(secrets, { mode: 0o700 });
    const serialize = (value) =>
      Object.entries(value)
        .map(([key, item]) => `${key}=${item}`)
        .join('\n');
    const releasePath = join(directory, 'release.env');
    for (const [path, content] of [
      [releasePath, serialize({ ...release, SECRETS_DIR: secrets })],
      [join(secrets, 'web.env'), serialize(web)],
      [join(secrets, 'worker.env'), serialize(worker)],
      [join(secrets, 'database-password'), password + '\n'],
      [join(secrets, 'pgbackrest.conf'), '[global]\nrepo1-type=s3\n'],
    ])
      await writeFile(path, content, { mode: 0o600 });
    assert.equal(
      (await releasePreflight(releasePath)).hostname,
      release.APP_HOST,
    );
    await chmod(join(secrets, 'web.env'), 0o640);
    await assert.rejects(releasePreflight(releasePath), /no group/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
