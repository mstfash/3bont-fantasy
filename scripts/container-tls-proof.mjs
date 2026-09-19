import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { request as httpsRequest, Agent } from 'node:https';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const proxyImage =
  'caddy:2-alpine@sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function request(
  base,
  agent,
  path,
  { method = 'GET', headers = {}, body } = {},
) {
  return new Promise((resolve, reject) => {
    const outgoing = httpsRequest(
      new URL(path, base),
      { agent, method, headers },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.once('error', reject);
        incoming.once('end', () =>
          resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    outgoing.setTimeout(10000, () =>
      outgoing.destroy(new Error('TLS request timed out')),
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

// Uses only the caller's disposable database/network and registers every
// container for its cleanup. Production mail is unreachable on this network.
export async function verifyTlsBoundary({
  docker,
  eventually,
  sql,
  directory,
  network,
  database,
  additionalNetworks,
  containers,
  hardened,
  webImage,
  password,
  localBase,
}) {
  const port = await availablePort();
  const base = `https://localhost:${port}`;
  const web = `${network}-secure-web`,
    proxy = `${network}-proxy`;
  const privateNetwork = `${network}-internal`;
  await docker(['network', 'create', '--internal', privateNetwork]);
  additionalNetworks.push(privateNetwork);
  await docker([
    'network',
    'connect',
    '--alias',
    'database',
    privateNetwork,
    database,
  ]);
  const accountPassword = randomBytes(24).toString('hex');
  const email = `tls-${randomBytes(8).toString('hex')}@example.invalid`;
  const signup = await fetch(`${localBase}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:3100',
    },
    body: JSON.stringify({
      name: 'TLS proof',
      email,
      password: accountPassword,
    }),
  });
  assert.equal(
    signup.status,
    200,
    'Synthetic identity created through local mail transport',
  );
  await signup.body?.cancel();
  // This is an isolated transport fixture; verification-email delivery has its
  // own browser acceptance flow. Never use this setup against a real database.
  await sql(`UPDATE "user" SET "emailVerified"=true WHERE email='${email}'`);
  await writeFile(
    join(directory, 'secure.env'),
    [
      'APP_ENV=production',
      `APP_BASE_URL=${base}`,
      `DATABASE_URL=postgresql://fantasy:${password}@database:5432/fantasy_container_proof`,
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
      'MAIL_MODE=resend',
      'MAIL_FROM=3BONT <proof@example.test>',
      `RESEND_API_KEY=${randomBytes(32).toString('hex')}`,
      'API_FOOTBALL_AUTOMATION_ENABLED=false',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  containers.push(web);
  await docker([
    'run',
    '--detach',
    '--name',
    web,
    ...hardened,
    '--label',
    'fantasy-platform-purpose=container-proof',
    '--network',
    privateNetwork,
    '--network-alias',
    'secure-web',
    '--env-file',
    join(directory, 'secure.env'),
    webImage,
  ]);
  assert.equal(
    await docker(['port', web]),
    '',
    'Secure backend has no host port',
  );
  containers.push(proxy);
  await docker([
    'run',
    '--detach',
    '--name',
    proxy,
    ...hardened,
    '--cap-add',
    'NET_BIND_SERVICE',
    '--label',
    'fantasy-platform-purpose=container-proof',
    '--network',
    network,
    '--tmpfs',
    '/data:rw,nosuid,size=16m,mode=0700',
    '--tmpfs',
    '/config:rw,nosuid,size=8m,mode=0700',
    '--publish',
    `127.0.0.1:${port}:${port}`,
    '--publish',
    '127.0.0.1::8080',
    '--env',
    `APP_HOST=localhost:${port}`,
    '--env',
    'HTTP_PORT=8080',
    '--env',
    'TLS_ISSUER=internal',
    '--env',
    'APP_UPSTREAM=secure-web:3100',
    '--mount',
    `type=bind,src=${resolve('infrastructure/Caddyfile')},dst=/etc/caddy/Caddyfile,readonly`,
    proxyImage,
  ]);
  await docker(['network', 'connect', privateNetwork, proxy]);
  let ca;
  await eventually(async () => {
    try {
      ca = await docker([
        'exec',
        proxy,
        'cat',
        '/data/caddy/pki/authorities/local/root.crt',
      ]);
      return ca.includes('-----BEGIN CERTIFICATE-----');
    } catch {
      return false;
    }
  }, 'isolated certificate authority ready');
  assert.ok(ca);
  const agent = new Agent({ ca, family: 4 });
  const send = (path, options) => request(base, agent, path, options);
  try {
    await eventually(async () => {
      try {
        return (await send('/api/health')).status === 200;
      } catch {
        return false;
      }
    }, 'production web through verified TLS');
    const httpPort = await docker(['port', proxy, '8080/tcp']);
    const redirect = await fetch(
      `http://localhost:${httpPort.split(':').at(-1)}/en`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), `${base}/en`);
    for (const locale of ['en', 'ar']) {
      const page = await send(`/${locale}`);
      assert.equal(page.status, 200);
      assert.ok(page.body.includes(`lang="${locale}"`));
      assert.equal(
        page.headers['strict-transport-security'],
        'max-age=31536000',
      );
      assert.equal(page.headers['x-content-type-options'], 'nosniff');
      assert.equal(page.headers['x-frame-options'], 'DENY');
      assert.equal(
        page.headers['referrer-policy'],
        'strict-origin-when-cross-origin',
      );
      assert.ok(
        page.headers['content-security-policy'].includes(
          "frame-ancestors 'none'",
        ),
      );
      assert.equal(page.headers.server, undefined);
    }
    const authHeaders = { 'content-type': 'application/json', origin: base };
    const signedIn = await send('/api/auth/sign-in/email', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, password: accountPassword }),
    });
    assert.equal(signedIn.status, 200);
    const cookies = signedIn.headers['set-cookie'] ?? [];
    const session = cookies.find((cookie) =>
      cookie.startsWith('__Secure-better-auth.session_token='),
    );
    assert.ok(session, 'Production session uses the secure cookie prefix');
    assert.match(session, /; Secure(?:;|$)/iu);
    assert.match(session, /; HttpOnly(?:;|$)/iu);
    assert.match(session, /; SameSite=Lax(?:;|$)/iu);
    const cookie = session.split(';')[0];
    const current = await send('/api/auth/get-session', {
      headers: { cookie },
    });
    assert.equal(current.status, 200);
    assert.equal(JSON.parse(current.body).user.email, email);
    const forgedOrigin = await send('/api/auth/sign-out', {
      method: 'POST',
      headers: {
        ...authHeaders,
        origin: 'https://untrusted.example.test',
        cookie,
      },
      body: '{}',
    });
    assert.equal(forgedOrigin.status, 403);
    // One legitimate sign-in already consumed the first request of the 5/60s
    // bucket. Changing every client-supplied forwarding header cannot reset it.
    for (let i = 0; i < 5; i++) {
      const attempt = await send('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'x-forwarded-for': `198.51.100.${i + 1}`,
          'x-real-ip': `192.0.2.${i + 1}`,
          'cf-connecting-ip': `203.0.113.${i + 1}`,
          forwarded: `for=198.51.100.${i + 1};proto=http`,
          'x-forwarded-proto': 'http',
        },
        body: JSON.stringify({
          email: `unknown-${i}@example.invalid`,
          password: accountPassword,
        }),
      });
      assert.equal(
        attempt.status,
        i === 4 ? 429 : 401,
        'Forged forwarding headers share the actual client rate limit',
      );
    }
    const signedOut = await send('/api/auth/sign-out', {
      method: 'POST',
      headers: { ...authHeaders, cookie },
      body: '{}',
    });
    assert.equal(signedOut.status, 200);
    assert.equal(
      JSON.parse(
        (await send('/api/auth/get-session', { headers: { cookie } })).body,
      ),
      null,
    );
    await docker(['stop', '--time', '10', web]);
    const privateMarker = randomBytes(24).toString('hex');
    assert.equal(
      (
        await send(`/api/auth/verify-email?token=${privateMarker}`, {
          headers: { cookie, 'x-private-proof': privateMarker },
        })
      ).status,
      502,
    );
    const proxyLogs = await docker(['logs', proxy]);
    assert.ok(
      proxyLogs.includes('http.log.error'),
      'Backend failure remains observable',
    );
    assert.ok(
      !proxyLogs.includes(privateMarker),
      'Failure logs omit request tokens and headers',
    );
    assert.ok(!proxyLogs.includes(cookie), 'Failure logs omit session cookies');
    const paths = [
      'infrastructure/Caddyfile',
      'infrastructure/production.compose.yml',
      'scripts/container-tls-proof.mjs',
      'scripts/container-smoke.mjs',
      'packages/application/src/identity.ts',
      'apps/web/src/server/runtime.ts',
      'apps/web/src/app/api/health/route.ts',
      'apps/web/src/app/api/auth/[...all]/route.ts',
    ];
    const sources = await Promise.all(
      paths.map(async (path) => ({
        path,
        sha256: createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      })),
    );
    await mkdir('artifacts/verification', { recursive: true });
    await writeFile(
      'artifacts/verification/tls-proof.json',
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          webImage,
          proxyImage,
          sources,
          checks: [
            'trusted test CA verifies TLS',
            'HTTP redirects to HTTPS',
            'EN/AR security headers',
            'backend has no published port',
            'production secure HttpOnly SameSite cookie',
            'authenticated session and revocation',
            'cross-origin sign-out refused',
            'forged forwarding headers cannot bypass authentication limit',
            'backend failure is observable without request tokens or cookies',
          ],
          limitations: [
            'Local internal CA, not public ACME/DNS/renewal evidence',
            'Synthetic identity verified in isolated fixture; no real email delivery',
            'No production host or capacity claim',
          ],
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'Production TLS boundary passed: redirects, trusted certificate, EN/AR, secure sessions, origin protection and forwarding-header rate limits. No external mail/provider traffic.',
    );
  } finally {
    agent.destroy();
  }
}
