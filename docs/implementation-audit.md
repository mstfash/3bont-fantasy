# Implementation audit — remaining release work

Updated 2026-09-19 against the shipped slice-37 baseline and the active production-readiness work. This replaces stale slice-29 assumptions; documentation is not completion evidence. The full release ledger is [production readiness](production-readiness.md).

## Implemented in the baseline

- Configurable competition/rules publication, structural freeze, notice periods, exact previews and equal future chip grants.
- Squads, strict deadlines, transfers, all chips, club-move grace, score calculation and coherent immutable result publications.
- Classic/H2H projections, scoped hypothetical prize allocations, shared-fixture pre-write review, bounded owner-only historical rules replay and delivered-award correction cases.
- Reviewed catalogue/valuation imports, source identity/mapping evidence, durable quota gateway, scheduled collection and ordinary FT normalization with ambiguity holds.
- Current-authority staff controls, participant authentication/recovery, profile/export/closure, group handover, support/moderation, achievements, chat, sponsors, prize terms/approval/fulfillment and entry retirement.
- Bilingual dynamic rule guides/admin handbook, responsive themed interfaces, public home rankings/winners/pitches and protected CI/container verification.

## Active correctness work

- Exceptional fixture decisions need explicit official evidence and retained disposition history; a full replay has a new identity, while resumed play replaces the cumulative report. Zero-performance rounds require reviewed settlement after lock. Implemented and verified locally in slice 38; protected CI remains required before merge.
- Historical participant-snapshot repair must derive from original accepted-command evidence, retain original snapshot versions and bind publication to the repaired version. It remains distinct from ordinary editing and completed historical scoring-rule replay.
- Provider automatic acceptance needs a versioned worker path, strict ambiguity/source/freshness gates, atomic acceptance and idempotency. Current collection does not imply accepted football facts.

## Release evidence still required

- Licensed Egyptian Premier League 2026/27 coverage and valuation supply, actual sample replay and approved price calibration.
- Named staging/production infrastructure, verified email/TLS, external monitoring, off-host encrypted backups/WAL archiving and demonstrated clean-environment restoration.
- Measured workload/cutoff contention and worker interruption on the selected hardware, retention/backup expiry procedures, operating/prize terms and final operator acceptance.

Continue independently on software and local rehearsal while external inputs are pending. Preserve current behavior through exact-head tests and protected PRs; do not declare launch readiness because a test count increased.
