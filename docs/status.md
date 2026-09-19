# Project status

Updated 2026-09-19.

Provider discovery: the supplied Free key authenticates but rejects 2026 (allowed 2022–2024). Three requests made; last daily remaining header was 98. Origin is connected to the supplied GitHub repository. Automatic collection remains off. See [account evidence and next steps](provider-account-validation-2026-09-19.md) and [valuation sourcing](market-valuation-sourcing.md).

See [release execution order](release-execution-plan.md) and [slice 33](implementation-slice-33.md) for the Git checkpoint, mandatory CI and reviewed match-timeline work.

## Implemented and verified

- Source archive, domain glossary, direct-answer history, delegated recommendations, canonical rules, release scope, evidence gates and delivery plan.
- Global domain-modeling skill installation and local strict pnpm/Turborepo Git project.
- Four 3BONT FANTASY Arabic/English dark/light PNGs, retained source logos, central theme tokens and Vikings-style participant/admin shells.
- Exact domain calculations for squads, transfer/chip lifecycle, fixture/gameweek scoring, pool feasibility, shared ranks, cash ties and H2H schedules.
- Verified participant authentication, account recovery, current-session staff MFA, scoped capabilities and explicit owner bootstrap.
- Transactional entry commands and deadlines, admin competition/rules/player-pool/fixture setup, publication readiness and audit trail.
- Evidenced match reports, persistent overrides/releases, coherent result revisions, complete-data finality, late reviews and audited reopening with preview.
- Overall-rank correction projections, aggregate affected-prize decisions and stale-confirmation protection across result/prize revisions.
- Public standings and latest-locked-lineup breakdowns; private upcoming lineups.
- Sourced catalogue/valuation forms, reviewed performance-price batches, Cairo date inputs and persistent scored rehearsal.
- Saved pricing-policy comparisons with current-pool baselines, finalized source revisions, deadline freezes, drift metrics and exact legal-squad affordability.
- Public/private classic groups, approval/invitation management and H2H editions with frozen schedules, coherent scores and durable future forfeits.
- Scheduled rule categories, notice protection, per-round public rule pages and exactly-once equal chip grants.
- Bilingual configuration impact previews with exact round schedules, aggregate entry effects and stale-confirmation protection.
- Fixed admin sidebar with independent workspace scrolling and mirrored RTL layout.
- Owner staff administration with scoped roles, current-authority checks and concurrent last-owner protection.
- Competition/group prize terms, exact ties and residues, historical membership eligibility, independent approval and recorded external fulfillment.
- Versioned cosmetic achievements, correction reconciliation, bilingual catalogue and attributed participant badge collections.
- Member-only group rooms, bounded account posting rates, reports, blocking/muting, organizer and scoped staff moderation, and expiring evidence.
- Scoped support desk and reviewed platform account suspension/restoration, with session revocation and suspended sign-in enforcement.
- Approved bilingual sponsor campaigns, scoped artwork, scheduled placements and anonymous aggregate reporting.
- Reviewed squad rename/retirement, preserved deadline history, future H2H forfeits and retirement-aware prize eligibility.
- Durable delivered-prize correction cases with immutable observations, independent resolution and public review status.
- Bilingual verification-email recovery and streaming byte limits for authentication and application requests.
- Source-bound starting-price suggestions, preserved pins, affordability checks and audited manual adjustments in draft competitions.
- Reviewed atomic catalogue imports, consistent season exports and bilingual before/after review.
- Durable provider quota gateway, scoped operational controls, worker fetch and restore pause, tested with synthetic transports.
- Reviewed season collection schedules, shared-fixture batches, crash recovery, bounded retries and worker health behind quota/activation gates.
- Reviewed provider match drafts with source/mapping retention, explicit historical eligibility evidence and unchanged-observation deduplication.
- Protected Arabic/English provider evidence review and redacted downloads, including retained malformed responses and unknown-data handling.
- Evidence-backed provider season bindings and versioned club/player/fixture mappings, with reviewed retirement, correction and fixture consistency.
- Current account/role checks at staff write transactions, serialized with revocation and closure.
- Reviewed account closure, public pseudonyms, credential/session revocation and preserved competitive history.
- Consensual, expiring group ownership handover with recipient acceptance and invitation revocation.
- Synchronized participant profiles and private, expiring background game-data exports.
- Durable worker-run health, stale detection, scoped access and private operational issue references.
- Verified Linux web/worker images, bounded Compose configuration, schema-aware readiness and isolated container startup/migration/shutdown proof.
- Local PostgreSQL, synthetic demo, private mail outbox, durable deadline/scoring jobs and standalone production preview.

- Arabic/English player how-to and playbooks tied to competition/gameweek versions, a scoped admin handbook, and localized keyboard/touch help across the UI and shared rule controls. See [slice 32](implementation-slice-32.md).

## Current boundary and next work

The complete launch scope is **not finished**. Ordinary rules, Cairo date controls, catalogue/valuation editing, reviewed performance-price batches and the persistent scored rehearsal are implemented. Continue defensive-event normalization and automatic validated report acceptance, real-data calibration and policy approval, retention/exceptional privacy handling and production rollout and measured recovery. Historical rule replay, exceptional fixture handling and classic-group/H2H correction projections and hypothetical award allocations also remain. See [slice 23](implementation-slice-23.md), [slice 24](implementation-slice-24.md), [slice 25](implementation-slice-25.md), [slice 26](implementation-slice-26.md), [slice 27](implementation-slice-27.md), [slice 28](implementation-slice-28.md), [slice 29](implementation-slice-29.md), [slice 30](implementation-slice-30.md) and [implementation audit](implementation-audit.md) and [delivery plan](delivery-plan.md).

No routine answer is pending. Provider/valuation licensing and target-season coverage, production credentials, calibration and measured load/restore/cost evidence remain [explicit gates](evidence-register.md). No remote repository, paid infrastructure, live data claim or deployment has been created.

## Verification

`pnpm check` covers formatting, typed lint, strict source/test checks, production build and 82 domain/authorization/date/request/provider/guide tests plus four authentication harness tests. `pnpm test:integration` runs nine persistence cases and 73 application cases/subcases on disposable PostgreSQL. `pnpm test:smoke` checks 56 public page combinations across language/theme/viewport, plus access/readiness boundaries. `pnpm test:e2e` (also `test:browser`) uses local Chrome and real PostgreSQL/authentication, with disposable account/competition/fixture cleanup. `pnpm test:containers` verifies isolated Linux startup, migrations, read-only operation and durable jobs; image proof is in `artifacts/verification/container-proof.json`. Screenshots are under `artifacts/brand` and `artifacts/web`. `pnpm verify:local` runs checks/integrations before starting an owned preview for smoke/E2E, preventing rebuilds during browser verification; see [slice 31](implementation-slice-31.md).

Provider coverage, complete gameplay and production readiness are not established by those tests. Canonical behavior remains in game-rules, pricing-policy, configuration-policy, result-lifecycle and module-specifications; discovery is the historical answer log.
