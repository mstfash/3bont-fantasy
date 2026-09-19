# Branding and participant squad workflow

The user replaced the proposed name with **3BONT FANTASY** and supplied the parent brand assets. Selected sources 04/05 provide Arabic/English dark marks; 12/13 provide their light counterparts. Four edited PNGs add matching Fantasy/فانتازي lettering. Originals, generation prompts, exports, the ZIP and visual review screenshots are retained. The light marks are transparent; dark marks use a clean opaque dark background. See [brand guide](brand.md).

## Working behavior

- Next.js Arabic/English home, competition, account, dashboard and squad pages share editable semantic color tokens. The document language/direction follows the route; language and light/dark preference persist. The account story deliberately remains a contrasting dark panel.
- Better Auth owns signup, verification, password reset, password hashing, sessions, rate limiting and TOTP login challenges. All signup/reset mail is local by default. Production configuration requires HTTPS and an explicitly configured mail transport. No public signup grants staff privileges.
- A verified participant can create a valid squad, change starters/bench/captain, make a transfer batch and activate/cancel chips. A preview shows resulting bank, total gameweek deductions and active chip. Server checks remain authoritative.
- Commands are serialized with competition/deadline changes, validate ownership and expected entry/price revisions, and store the outcome under an actor-bound idempotency key. The server samples PostgreSQL's clock after waiting for locks. Late requests fail explicitly; retries of accepted requests return the original outcome.
- Existing holdings tolerate real club changes for lineup editing. The next fantasy transfer batch must satisfy the club cap. Unlicensed valuation values are removed before public/client serialization.
- Local setup generates secrets with restricted file permissions and starts a persistent loopback-only PostgreSQL container. A separate idempotent seed supplies a labeled synthetic six-club, 90-player demonstration. Re-running it does not reset participant choices or deadlines.

## Evidence

`pnpm check` runs formatting, strict lint/declaration checks, production builds and 51 domain/authorization tests. `pnpm test:integration` passes the nine persistence tests plus the deadline race and six real command scenarios. `pnpm test:browser` drives actual signup, rejected unverified login, verification, squad creation, chip activation/cancellation, light-mode persistence, sign-out, password reset and login with the replacement password. Browser test accounts are removed after each run; no real email is sent.

Screenshots under `artifacts/web/` cover Arabic/English home and the squad editor in desktop dark/mobile light. The browser found a new route missing from a running development server's route inventory after files were added; restarting that server restored it. The production route manifest includes the entry route. Brand PNGs decode and the inspected 390px layouts have no horizontal overflow.

Next's dev child process rejects Node's `--env-file-if-exists` when forwarded through `NODE_OPTIONS`; the web launcher now loads the environment before importing Next. Better Auth's declarations reference `bun:sqlite` even with PostgreSQL, so the application includes only the official SQLite type declaration instead of conflicting Bun globals. Runtime remains Node/PostgreSQL, with `skipLibCheck: false`.

## Still required for the complete release

Staff MFA proof bound to the active session, explicit owner bootstrap, admin workflows, group/H2H publication, prizes, achievements, chat/moderation, sponsors, provider quota/ingestion, scoring/result publication/finality/corrections, price-update jobs, operational deployment and restore/load evidence remain unfinished. TOTP support in the identity framework alone is not proof that an admin session satisfied MFA. The demo does not represent real Egyptian Premier League coverage or establish valuation licensing. The complete launch scope remains unchanged.
