# Slice 03 — Staff operation, competition setup and published scores

Implemented 2026-09-18. This extends the running application; it does not complete the full release scope.

## Working application paths

Staff enrolls a TOTP authenticator, saves recovery codes and verifies both password and current authenticator code before administration. Proof belongs to the current session, expires after eight hours, and must be within fifteen minutes for mutations. Disabling the authenticator invalidates staff access. Owner bootstrap is an explicit local/operator command for a verified account with confirmed MFA; signup never grants staff authority.

An authorized manager creates a draft, reviews the eligible player pool and prices, assigns fixtures and deadlines, and publishes. Publication proves an affordable legal squad exists, accounting for positional quotas and club limits. Configuration changes preserve locked rules; entry-cap reductions cannot invalidate existing entries. Fantasy positions cannot be changed after a deadline merely because the worker has not yet processed it. Postponed unplayed fixtures can move forward; started matches cannot.

The deadline worker also freezes the gameweek’s player pool. Football imports preserve evidence and explicit fixture eligibility; unknown statistics remain unknown. Match reports and persistent player corrections are available in the admin UI. A later report cannot erase an active override; release is a separate audited action.

Scoring publishes one coherent gameweek revision for every entry in a transaction. Live results defer automatic substitutions and vice-captain fallback until participation is settled. Finalization requires complete data, settled fixtures, no unresolved review and the configured correction window since the last material change. Corrections after finalization create a deduplicated review and retain published scores. An admin can preview changed totals and reopen with a reason; the command binds to the preview fingerprint and result revision.

Public standings use each gameweek’s published revision, preserve shared ranks and paginate fifty entries per page. Public squad breakdowns expose only the latest locked lineup, never next-round editing state. Arabic/English, dark/light and the four supplied-brand variants are used throughout.

## Verification

- `pnpm check`: formatting, strict type checking, lint, production build, 53 domain scenarios and two authorization tests.
- `pnpm test:integration`: nine persistence cases and eleven application cases/subcases against disposable PostgreSQL. New scenarios cover pool readiness, retry identity, elapsed deadlines, fixture movement, complete scoring, persistent overrides, concurrent late-review creation and explicit override release.
- `pnpm test:browser`: real local signup/verification, squad save, chips, reset, theme, MFA/recovery and staff session binding; admin draft/fixture/pool/publication flow; synthetic deadline/report/scoring/standings flow. The test creates and removes only its own QA account, competition and fixture.
- The standalone production launcher includes public assets and Next static output. Local mail remains private and no real email is sent.

## Operator startup

```sh
nvm use
pnpm local:setup
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Register and verify an account using its local mail-outbox link, enroll the authenticator at `/en/security` or `/ar/security`, then run:

```sh
pnpm --filter @fantasy/worker... build
pnpm --filter @fantasy/worker owner:bootstrap verified-address@example.com
```

The bootstrap accepts only the explicitly named verified/MFA-enabled account and refuses a different account once an owner exists. Unlock administration on the Security page. For a production-mode local preview, run `pnpm build` and `pnpm --filter @fantasy/web start`; keep the worker running separately for deadlines and scoring.

## Remaining work

This is still an implementation build. Slice 04 adds ordinary rules, catalogue/valuation forms, reviewed price batches and a persistent replay. Historical rule-replay/fixture-disposition, staff grants, bulk/provider imports, automatic price calibration, groups, H2H operation, prizes, achievements, chat/moderation and sponsors remain release work. Deployment, rate/quota recovery, restore/load tests and live provider/valuation evidence are not established by synthetic tests. Award consequences must be connected before any prize module is enabled.

The scoring worker currently inspects all non-upcoming rounds each run. It batches result writes but has not been capacity-tested for the pilot target; incremental dirty-round scheduling and measured queries belong to the operating work, not a claimed performance guarantee.
