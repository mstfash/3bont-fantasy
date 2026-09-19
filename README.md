# 3BONT FANTASY

Configurable Egyptian Premier League fantasy platform, initially targeting 2026/27.

**Status:** implementation in progress. Core fantasy, Arabic/English participant/admin flows, groups/H2H, achievements, moderated chat, sponsor campaigns, staff/support, prizes and post-delivery corrections run locally against PostgreSQL. Provider quota operations are verified with synthetic transports; atomic catalogue imports and initial valuation-price suggestions and saved price-calibration experiments are verified. Configuration updates include a bilingual impact review and stale-confirmation protection. Reviewed provider match drafts retain source and mapping evidence. Correction previews project overall ranks and flag affected prize decisions, with confirmation bound to their revisions. Season schedules collect source bundles through the quota gateway with bounded retries and crash recovery. Defensive-event normalization, automatic report acceptance, real-data calibration approval, exceptional privacy handling, exceptional replay and production evidence remain. See [project status](docs/status.md) and [implementation audit](docs/implementation-audit.md).

Brand preview: `pnpm --filter @fantasy/web dev`, then visit `http://127.0.0.1:3100/brand`. The [brand guide](docs/brand.md) records the four selected source marks and exported PNGs.

## Start here

1. [Product brief](docs/product-brief.md) and [first-release scope](docs/release-scope.md)
2. [Requirements](docs/requirements.md) and [delegated decisions](docs/delegated-decisions.md)
3. [Domain glossary](CONTEXT.md) and [ownership/stress cases](docs/domain-workshop.md)
4. [Game rules](docs/game-rules.md), [pricing](docs/pricing-policy.md) and [configuration lifecycle](docs/configuration-policy.md)
5. [Results and corrections](docs/result-lifecycle.md) and [module contracts](docs/module-specifications.md)
6. [Architecture](docs/architecture.md) and [ADRs](docs/adr/README.md)
7. [Implementation plan](docs/delivery-plan.md) and [acceptance scenarios](docs/acceptance-scenarios.md)
8. [Provider validation](docs/provider-validation.md), [evidence gates](docs/evidence-register.md) and [operations/costs](docs/operations.md)
9. [Current status](docs/status.md) and [historical discovery](docs/discovery.md)

One operator can run multiple competitions sharing real-season data. Each supports configurable multiple entries, versioned rules and independent results. All requested launch modules except native apps remain included.

## Source material

The [transcript](docs/sources/chat-transcript.md) and [structured export](docs/sources/chat-export.json) preserve all six turns returned by the source chat tool. [The source register](docs/sources/README.md) records retrieval gaps. Historical assistant suggestions are source material, not automatically accepted instructions. Commercial discussion remains in the private local archive.

## Local development

Use Node 24.14.0 (.nvmrc) and pnpm 10.14.0 (packageManager).

```sh
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test:integration
corepack pnpm local:setup
corepack pnpm db:seed
corepack pnpm dev
```

Checks run formatting, type-aware lint, strict type checking, build and domain scenario tests. The separate integration command requires Docker and creates/removes its own isolated PostgreSQL container; it does not use your existing databases.

`local:setup` creates private `.env.local` secrets only when absent and starts a project-specific PostgreSQL container on loopback port 54329. `db:seed` adds an explicitly synthetic six-club, 90-player competition without overwriting it on repeat runs. The web app is at `http://127.0.0.1:3100`, Arabic by default, with persistent English/light-mode switches. Local verification/reset messages are saved under `.local/mail/`; they are never sent externally or served by HTTP.

With the web app and local database running, `pnpm test:browser` exercises real signup, email verification, squad creation, chip activation/cancellation, light mode, sign-out and password reset. It also exercises staff MFA/recovery, competition publication and synthetic match scoring/standings. It requires local Google Chrome, creates a unique test account, and removes that account and its test entries afterward. Never run it against production.

Verification commands are available independently:

- `pnpm check`: formatting, typed lint, strict source/test checks, production build, unit tests and authentication harness tests.
- `pnpm test:integration`: disposable PostgreSQL integration tests, including concurrency and crash recovery.
- `pnpm test:smoke`: read-only public page matrix across Arabic/English, dark/light and desktop/mobile, against the running local preview.
- `pnpm test:e2e`: full authenticated player/admin workflows (alias of `test:browser`). Stop the background worker first so scheduled jobs cannot alter test fixture deadlines.
- `pnpm test:containers`: isolated Linux runtime proof using the built proof images.

For the complete local sequence, stop the preview and background worker, then run `pnpm verify:local`. It refuses an occupied port 3100, completes the build and integrations before starting its own preview, runs smoke/E2E, and stops that preview afterward. Restart normal development services when it finishes. Do not rebuild the same standalone directory while a preview is serving from it. See [reliability verification](docs/implementation-slice-31.md).

```text
apps/web/                    Next.js public/account/squad pages and HTTP handlers
apps/worker/                 Durable deadline/scoring jobs, migration, demo and owner bootstrap CLIs
packages/domain/             Prices, squads, transfers, chips, scoring, ranks and H2H
packages/contracts/          Strict Zod request/data contracts
packages/application/        Authentication, transactional commands, evidence, scoring and authorization
packages/persistence/        Typed SQL, migrations, transactions and pg-boss bridge
packages/typescript-config/  Shared compiler policy
docs/                        Canonical specs, plan, evidence and decisions
CONTEXT.md                   Domain vocabulary only
```

[Architecture](docs/architecture.md) uses Next.js web/API, a separate worker, PostgreSQL/Kysely/pg-boss and runtime-validated contracts. See [current build](docs/current-build.md) for implemented slices and remaining work. [Slice 03](docs/implementation-slice-03.md) includes staff setup and production-preview instructions.

## Player and admin guides

Arabic and English player how-to and playbook pages are linked throughout the app: `/ar/how-to-play`, `/en/how-to-play`, `/ar/playbook`, and `/en/playbook`. Select a competition and gameweek to read that saved rule version. Admins can open the protected `/ar/admin/how-to` or `/en/admin/how-to` handbook directly from the dashboard or sidebar. Localized info icons support hover, keyboard and touch; shared rule-field help reflects the current form value. See [help and playbooks](docs/help-and-playbook.md) for coverage and maintenance.

Provider account discovery (2026-09-19): [Free-plan season restriction, quota evidence and next steps](docs/provider-account-validation-2026-09-19.md); [real market-value sourcing](docs/market-valuation-sourcing.md).
