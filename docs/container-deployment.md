# Container release and staging runbook

The web and worker use the same locked source build. `pnpm container:build` copies an explicit source/manifests/assets allowlist into a temporary context and builds `3bont-fantasy-web:local-proof` and `3bont-fantasy-worker:local-proof`. It excludes local credentials, mail, database files and screenshots. The Dockerfile pins Node 24.14.0 by the locally verified digest and pnpm 10.14.0; application dependencies use the committed lockfile. The worker deployment contains production dependencies and compiled workspace packages. Both final images run as the unprivileged Node user.

`FANTASY_BUILD_NODE_IMAGE` is a build-only override for verifying an already available image. Record the actual digest and platform when using it; do not replace a release's pinned runtime with an unrecorded moving tag. The build script never changes the user's Docker configuration. Local verification used an empty temporary Docker client configuration and the existing Docker daemon after the default client configuration stalled during image resolution; no credentials were copied or removed.

Run `pnpm test:containers` after building: it uses an isolated database/network, temporary generated credentials and loopback HTTP/HTTPS, tests missing/changed schema, read-only/non-root operation, production authentication behind Caddy and worker shutdown, then removes its test resources. The production-authentication fixture has no outbound network route; it sends no provider or mail requests. Its internal test certificate authority is explicitly trusted by the test client, without disabling certificate verification.

## Private configuration

Create a private directory outside the checkout with mode 0700, and files with mode 0600:

- `database-password`: a generated database password, used by the PostgreSQL secret mount.
- `pgbackrest.conf`: reviewed encrypted off-host repository settings and a separately protected recovery passphrase, based on infrastructure/postgres/pgbackrest.conf.example.
- `web.env`: `APP_BASE_URL` (the exact public HTTPS origin), `DATABASE_URL`, a generated `BETTER_AUTH_SECRET` of at least 32 characters, `MAIL_MODE=resend`, a verified `MAIL_FROM` and `RESEND_API_KEY`.
- `worker.env`: `DATABASE_URL`; add `API_FOOTBALL_KEY` only when provider licensing, account limits and reconciliation are verified. The web process does not need that key.

For the provided stack, the database URL connects to the internal `postgres` service, database `fantasy`, role `fantasy`, with the same password as the secret file. URL-encode its password. Keep the same database role/search path for migration and runtime so identity tables resolve consistently. Never print resolved Compose configuration or pass secrets as build arguments.

A separate release environment file (mode 0600) contains `SECRETS_DIR` (absolute), immutable `WEB_IMAGE`, `WORKER_IMAGE` and `POSTGRES_IMAGE` registry references (`repository@sha256:...`), and `APP_HOST` (one public hostname, without a scheme, port or path). Set `APP_BASE_URL` to exactly `https://APP_HOST`. Build `pnpm backup:build` and use the reviewed PostgreSQL 17/pgBackRest release digest; see [backup and recovery](backup-recovery.md). Resource limits in `infrastructure/production.compose.yml` are initial staging bounds, not measured host sizing: proxy 256 MiB/0.5 CPU, web 1 GiB/1 CPU, worker 768 MiB/1 CPU and PostgreSQL 2 GiB/1.5 CPU. Web uses ten database connections; worker application and queue pools are each capped at four. Leave additional host memory for the database cache and operating system.

## Start a release

Use a clean staging database first. Commands below use a release environment file with image names and paths, never inline credentials:

```sh
node scripts/release-preflight.mjs /srv/3bont/release.env
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml config --quiet
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml up -d postgres
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml --profile operations run --rm migrate
node scripts/backup-operations.mjs init /srv/3bont/release.env
node scripts/backup-operations.mjs check /srv/3bont/release.env
node scripts/backup-operations.mjs full /srv/3bont/release.env
node scripts/backup-operations.mjs status /srv/3bont/release.env
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml up -d web worker proxy
```

Stop on migration failure. The web readiness endpoint `/api/health` returns only `ready` or `unavailable`, with no-store caching. It requires a writable primary, validates every migration/checksum required by that build and waits for successful identity initialization; missing or changed schema returns HTTP 503. Identity starts lazily after schema readiness, shares concurrent initialization and retries failed attempts. Probes before migration cannot poison later authentication. Newer additive migrations allow an older compatible build to run. The worker verifies schema readiness before creating queues or processing jobs. Managed web/worker PostgreSQL pools observe both idle and checked-out connection errors without dumping raw errors or retrying writes. The isolated proof verifies web recovery after a database restart and a further worker job after idle-connection loss. Docker health alone does not prove successful scoring, mail delivery or provider coverage; inspect the worker dashboard and test external monitoring.

The preflight checks file permissions, immutable image references, matching origins and database secrets without printing credentials. It does not contact the registry, DNS, mail or backup services. A passed preflight is a configuration check; the staging drill must prove those services.

The database and web have no published ports. The pinned Caddy proxy is the only public service, on TCP 80/443 and optional HTTP/3 UDP 443. Point the hostname's A record (and AAAA only if IPv6 actually works) directly at the intended host and permit those ports. Caddy obtains and renews public ACME certificates, redirects HTTP to HTTPS and persists certificate state in `proxy_data`. Keep that private volume through release replacement; do not copy staging certificate state into production. A new proxy must complete certificate issuance before HTTPS acceptance can pass. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Caddy replaces untrusted `X-Forwarded-*` input by default; the supplied configuration also replaces `X-Real-IP` and removes `Forwarded`/`CF-Connecting-IP`. No CDN or other upstream proxy is trusted. Adding one requires a separate reviewed trust policy and rate-limit isolation test; otherwise clients behind it share its observed address. See [Caddy reverse-proxy header handling](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). The isolated proof signs in through real production authentication, verifies secure HttpOnly cookies and session revocation, rejects a forged origin and demonstrates that changing forwarding headers cannot rotate the sign-in rate-limit bucket.

The proxy limits request bodies to 16 MiB and adds one-year HSTS, nosniff, frame denial and a narrow frame/object/base CSP. It does not enable HSTS preload or subdomain coverage. Access logging is disabled, and runtime log filtering removes the entire request object, including URLs and headers. A forced backend outage tests that errors remain observable without its synthetic token or cookie. Keep Docker logs bounded and private. Record actual public certificate validity, renewal monitoring and DNS evidence on the chosen host; the local internal-CA test does not prove public issuance or renewal.

The web and worker have read-only roots, temporary storage, dropped Linux capabilities and bounded local logs. Sponsor assets and export chunks remain in PostgreSQL. A future feature requiring durable filesystem writes must declare its own storage and backup policy rather than silently making the container writable.

## Restore and rollback

This Compose volume is persistent storage, not an off-host backup. The [backup workflow](backup-recovery.md) implements encrypted base backups, WAL archival and local clean-volume restoration; actual off-host access, alerting and production-sized recovery still require the named deployment drill. Before starting provider work against restored data, run the worker image's `dist/provider-restore-pause.js`, then reconcile usage with the provider account. Keep all live provider access paused throughout a rehearsal.

Retain the previous web/worker image digests. Additive migrations support compatible code rollback; never delete ledger/audit data or reverse migrations blindly. Reconcile external side effects before restarting jobs. Do not use `down --volumes` on a real environment.

Production credentials, verified sending domain, TLS, off-host backup/restore, load/cost measurements and target-season data rights remain deployment gates. These files do not provision or publish a live service.
