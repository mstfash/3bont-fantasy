# Delivery plan

Baseline selected 2026-09-18. Implement every required launch module; native apps are deferred. No launch date or fixed-price estimate is promised. [Evidence gates](evidence-register.md) are tracked independently from completed code.

## P0 — Evidence and workspace — completed

Retrieved available source chat, preserved gaps, installed domain-modeling globally, initialized Git, pinned strict pnpm/Turborepo tooling and verified its build. Subsequent gameplay progress is recorded under P3 and the implementation slices.

## P1 — Design baseline — completed

Direct answers Q01–Q16 and delegated D01–D15 now define vocabulary, gameplay, configuration lifecycle, corrections, modules, architecture and acceptance. Remaining unknowns are evidence/commercial gates, not an unanswered routine preference interview.

## P2 — Provider and transaction proof — software verified; live evidence pending

[Slice 01](implementation-slice-01.md) provides real PostgreSQL locking/idempotency/transactional-enqueue evidence and a durable-ceiling probe. Kysely integration, the core migration and deadline rollover are now exercised; the durable quota controller and scheduled source collection are verified. Licensed current-season samples and automatic accepted reports remain open. See [current build](current-build.md).

- P2.1: Resolve exact target season/phases and collect redacted completed-fixture samples plus two live windows; populate provider coverage matrix (E01).
- P2.2: Identify and verify valuation source/import, dates, currency, display rights and representative coverage (E02).
- P2.3: Build synthetic adapter fixtures for missing/corrected events, red-card normalization and participation timelines; label all synthetic data.
- P2.4: Prove PostgreSQL entry/deadline locking, idempotency and pg-boss transactional enqueue under retries/crashes. Select and pin compatible app dependencies.
- P2.5: Implement request-budget reservation tests with fake network transport: concurrency, timeout, pagination, retry, reset, older-backup recovery and unknown quota. No real key needed for these.
- P2.6: Record bounded engine reuse audit outcome before adopting any external domain code.

Exit: reproducible adapter contracts and transactional proof, with any unsupported real-data input explicitly blocking its production capability. No schema field may turn “missing” into a false zero.

## P3 — First usable vertical slice — running synthetic flows

Slices 02–03 connect accounts, staff MFA, competition setup, squads/transfers/chips, deadlines, evidenced match data, scoring/finality and public standings. Slice 04 adds catalogue/valuation forms, ordinary rule controls, reviewed performance-price batches and a persistent synthetic rehearsal. Bulk/provider import and broader exceptional correction cases remain. See [slice 04](implementation-slice-04.md).

Admin creates one draft competition from template, maps fixtures, imports footballers/valuations, reviews initial prices and publishes registration. Participant signs up, verifies email, creates an entry, builds a legal squad and confirms a lineup. Simulated clock locks it; worker scores an evidenced fixture and publishes a points breakdown/standings. Admin correction previews and publishes a new coherent revision.

Build in this order:

1. Pure domain price/formation/scoring units with meaningful edge-case tests and explicit rule versions.
2. Persistence schema for identities, competition/entry state, commands/snapshots, facts/overrides and result revisions. Add only tables needed by this path.
3. Runtime contracts and application commands, server-enforced ownership and idempotency.
4. Web/admin Arabic/English flows and worker orchestration through the same use cases.
5. End-to-end scenario with duplicate ingestion, stale command, deadline crossing and corrected fact.

Exit: runnable documented local demonstration. Its simulated data is visibly labeled; it is not the live-data gate.

## P4 — Complete competitive core

- P4.1: Registration/caps/retirement and real club movements, including concurrent cap changes.
- P4.2: Transfer accrual, selling policies, quote revision checks, hits and next-round editing.
- P4.3: All four chips, inventory, cancellation, two Free Hit baselines and restoration races.
- P4.4: Auto-subs, captaincy, full scoring template, fixture dispositions and late data.
- P4.5: Versioned configuration publication, structural freeze, audit, historical replay/finality.
- P4.6: Pricing dry-run simulator, affordability/drift report, calibrated bounded automatic batches.
- P4.7: Public/private classic groups, invitation management and ranking tie policies.

Exit: core acceptance scenarios and coherent replay pass with real recorded samples; all admin choices have validation and visible effects. A disabled unvalidated bonus formula follows Q12d and is not missing launch functionality.

## P5 — All additional launch modules

- P5.1 H2H: edition registration/frozen roster, fair full-cycle schedule, byes/forfeits, net-point outcomes, revisioned corrections.
- P5.2 Prizes: published pool terms, eligibility/ties, review/approval/fulfillment and corrected-award cases.
- P5.3 Achievements: localized template catalogue, idempotent grants/revocations and entry attribution.
- P5.4 Chat: membership-aware rooms, text, report/block/mute, moderator workflows and retention jobs.
- P5.5 Sponsors: localized assets/slots, date scheduling, previews and aggregate reporting.
- P5.6 Account/admin access: enforce role scopes/MFA, support views and privacy boundaries throughout.
- P5.7 Bilingual/mobile-web QA of every module, including admin and email.

Exit: each module has a working participant/admin flow and its failure/correction/access tests. A toggle, placeholder or database table is not module completion.

## P6 — Rehearsal and release

Provision reproducible staging and exercise full gameweek replay/live rehearsal, outage, quota exhaustion, late correction, concurrent deadline peak, worker crash, restore, schema rollback and prize hold. Test the selected hardware against [operations targets](operations.md), record costs, complete E01–E08 and client acceptance. Fix failed gates before committing a launch date.

Exit: one full operating rehearsal with every required module and recorded operator interventions, off-host restoration evidence, reviewed price calibration and a release/rollback checklist attached to the exact revision.

## Tracking and definition of done

Use the P identifiers above as initial issue keys. Each implementation item records dependencies, linked requirements/scenarios, changes, test evidence and remaining gates. Estimate after P2 establishes provider work and P3 establishes actual throughput; do not recycle old assistant hour estimates.

A feature is done only with typed implementation, runtime boundary validation, functional user/admin flow, material invariant/failure tests, migration/operating notes where applicable and updated docs. Keep single-purpose PRs that deliver usable behavior; no speculative packages, universal rule language or placeholder completeness.

Current execution order is maintained in [production readiness](production-readiness.md): exceptional fixture settlement, evidence-backed snapshot repair, validated provider acceptance, deployment/recovery/load and final release rehearsal. Privacy, quota operations and reviewed bulk import have shipped; this historical sequencing is not an unresolved feature list. Groups, H2H, staff/support, achievements, chat, sponsors, entry retirement and prize correction operations are implemented and verified in slices 05–13. P2.3–P2.5 provider/quota fixtures can continue with synthetic data while real coverage evidence is obtained. No external credentials, paid services or claimed data rights are implied by this plan.
