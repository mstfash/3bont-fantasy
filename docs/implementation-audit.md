# Implementation audit — remaining release work

Updated 2026-09-19 against the shipped slice-40 baseline and the active production-readiness work. This replaces stale slice-29 assumptions; documentation is not completion evidence. The full release ledger is [production readiness](production-readiness.md).

## Implemented in the baseline

- Configurable competition/rules publication, structural freeze, notice periods, exact previews and equal future chip grants.
- Squads, strict deadlines, transfers, all chips, club-move grace, score calculation and coherent immutable result publications.
- Classic/H2H projections, scoped hypothetical prize allocations, shared-fixture pre-write review, bounded owner-only historical rules replay and delivered-award correction cases.
- Reviewed catalogue/valuation imports, source identity/mapping evidence, durable quota gateway, scheduled collection and ordinary FT normalization with ambiguity holds.
- Current-authority staff controls, participant authentication/recovery, profile/export/closure, group handover, support/moderation, achievements, chat, sponsors, prize terms/approval/fulfillment and entry retirement.
- Bilingual dynamic rule guides/admin handbook, responsive themed interfaces, public home rankings/winners/pitches and protected CI/container verification.

## Active correctness work

- Exceptional fixture decisions need explicit official evidence and retained disposition history; a full replay has a new identity, while resumed play replaces the cumulative report. Zero-performance rounds require reviewed settlement after lock. Merged after exact-head required CI in PR 13.
- Historical participant-snapshot repair now derives from the latest original accepted command before deadline, retains original/repair versions and atomically publishes the repaired result. Slice 39 includes private exports, version-safe public reads and failure/concurrency/browser coverage.
- Slice 40 adds owner-approved automatic FT acceptance, strict data/source/freshness holds, atomic evidence and idempotency. Merged after exact-head CI in PR 15; licensed provider validation remains separate.

- A01–A62 are indexed in [acceptance evidence](acceptance-evidence.md). A dedicated persisted club-move/next-transfer replay for A13/A59 now exercises actual catalogue moves and repair transfers.

## Release evidence still required

- Licensed Egyptian Premier League 2026/27 coverage and valuation supply, actual sample replay and approved price calibration.
- Named staging/production infrastructure, verified email/TLS, external monitoring, off-host encrypted backups/WAL archiving and demonstrated clean-environment restoration.
- Measured workload/cutoff contention and worker interruption on the selected hardware, retention/backup expiry procedures, operating/prize terms and final operator acceptance.

Continue independently on software and local rehearsal while external inputs are pending. Preserve current behavior through exact-head tests and protected PRs; do not declare launch readiness because a test count increased.

Slice 41 implements encrypted base/WAL backup tooling and clean-volume recovery with wrong-key/missing-WAL checks. Writable-primary readiness is enforced. Local mechanism proof does not close off-host access, alert delivery or production-sized recovery evidence.
