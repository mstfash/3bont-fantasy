# Container release and staging runbook

The web and worker use the same locked source build. `pnpm container:build` copies an explicit source/manifests/assets allowlist into a temporary context and builds `3bont-fantasy-web:local-proof` and `3bont-fantasy-worker:local-proof`. It excludes local credentials, mail, database files and screenshots. The Dockerfile pins Node 24.14.0 by the locally verified digest and pnpm 10.14.0; application dependencies use the committed lockfile. The worker deployment contains production dependencies and compiled workspace packages. Both final images run as the unprivileged Node user.

`FANTASY_BUILD_NODE_IMAGE` is a build-only override for verifying an already available image. Record the actual digest and platform when using it; do not replace a release's pinned runtime with an unrecorded moving tag. The build script never changes the user's Docker configuration. Local verification used an empty temporary Docker client configuration and the existing Docker daemon after the default client configuration stalled during image resolution; no credentials were copied or removed.

Run `pnpm test:containers` after building: it uses an isolated database/network, temporary generated credentials and loopback HTTP, tests missing/changed schema, read-only/non-root operation and worker shutdown, then removes its test resources. It sends no provider or mail requests.

## Private configuration

Create a private directory outside the checkout with mode 0700, and files with mode 0600:

- `database-password`: a generated database password, used by the PostgreSQL secret mount.
- `web.env`: `APP_BASE_URL` (the exact public HTTPS origin), `DATABASE_URL`, a generated `BETTER_AUTH_SECRET` of at least 32 characters, `MAIL_MODE=resend`, a verified `MAIL_FROM` and `RESEND_API_KEY`.
- `worker.env`: `DATABASE_URL`; add `API_FOOTBALL_KEY` only when provider licensing, account limits and reconciliation are verified. The web process does not need that key.

For the provided stack, the database URL connects to the internal `postgres` service, database `fantasy`, role `fantasy`, with the same password as the secret file. URL-encode its password. Keep the same database role/search path for migration and runtime so identity tables resolve consistently. Never print resolved Compose configuration or pass secrets as build arguments.

A separate release environment file contains only `SECRETS_DIR` (absolute), immutable `WEB_IMAGE`, `WORKER_IMAGE` and `POSTGRES_IMAGE` references, and optionally `WEB_PORT`. Select a reviewed PostgreSQL 17 image digest. Resource limits in `infrastructure/production.compose.yml` are initial staging bounds, not measured host sizing: web 1 GiB/1 CPU, worker 768 MiB/1 CPU and PostgreSQL 2 GiB/1.5 CPU. Web uses ten database connections; worker application and queue pools are each capped at four. Leave additional host memory for the database cache, proxy and operating system.

## Start a release

Use a clean staging database first. Commands below use a release environment file with image names and paths, never inline credentials:

```sh
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml config --quiet
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml up -d postgres
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml --profile operations run --rm migrate
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml up -d web worker
```

Stop on migration failure. The web readiness endpoint `/api/health` returns only `ready` or `unavailable`, with no-store caching. It validates database access and every migration/checksum required by that build; missing or changed schema returns HTTP 503. Newer additive migrations allow an older compatible build to run. The worker verifies schema readiness before creating queues or processing jobs. Docker health alone does not prove successful scoring, mail delivery or provider coverage; inspect the worker dashboard and test external monitoring.

The database has no published port. The web binds to host loopback only. Configure a host TLS reverse proxy to `127.0.0.1:3100`, preserving the public Host and replacing `X-Forwarded-For` with the actual trusted client address. Do not append an untrusted client-supplied forwarding chain. Test address isolation against the authentication rate limiter and configure any CDN trust separately. Keep TLS, DNS and certificate renewal evidence with the deployment.

The web and worker have read-only roots, temporary storage, dropped Linux capabilities and bounded local logs. Sponsor assets and export chunks remain in PostgreSQL. A future feature requiring durable filesystem writes must declare its own storage and backup policy rather than silently making the container writable.

## Restore and rollback

This Compose volume is persistent storage, not an off-host backup. The [operating plan](operations.md) still requires encrypted base backups, WAL archival, retention and a clean-host restore drill. Before starting provider work against restored data, run the worker image's `dist/provider-restore-pause.js`, then reconcile usage with the provider account. Keep all live provider access paused throughout a rehearsal.

Retain the previous web/worker image digests. Additive migrations support compatible code rollback; never delete ledger/audit data or reverse migrations blindly. Reconcile external side effects before restarting jobs. Do not use `down --volumes` on a real environment.

Production credentials, verified sending domain, TLS, off-host backup/restore, load/cost measurements and target-season data rights remain deployment gates. These files do not provision or publish a live service.
