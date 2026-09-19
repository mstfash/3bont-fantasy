# Slice 38 — exceptional fixtures and explicit zero-performance settlement

This work closes the implicit-zero behavior found during the full production-readiness audit. A bare void/awarded status no longer proves settlement, and a gameweek with no playable fixtures no longer finalizes automatically.

## Official decisions

Global match-data staff review a void without replay, a void linked to a distinct unplayed replacement fixture, or an awarded team score with zero footballer performance. The existing rollback-only shared-match preview binds every affected competition. Confirmation retains the official reference, reason, actor, previous fixture and disposition revision. Regular reports cannot undo an active disposition; staff must explicitly release it first.

A replacement must use the same season and clubs, have no conflicting replay link, and have no locked/expired gameweek assignment. Its actual future assignment remains a separately reviewed calendar operation. Suspended/resumed play keeps the original fixture and accepts one complete cumulative report; ingestion replaces the prior report instead of adding partial totals. Reaccepting the same sporting report after an official release restores its state correctly without duplicating performance.

## Zero-performance gameweeks

A scoped competition manager with fresh verification previews settlement only after the round has locked and every remaining fixture has an evidenced void/awarded decision, or when there are no assigned fixtures. Preview simulates the exact approval marker and rolls back. The marker is bound to the current assignment/disposition revisions; subsequent decisions require a fresh approval.

Confirmation atomically stores the marker, resolves the reviewed result cases and publishes a complete canonical result revision. Footballer points are zero; accepted transfer deductions, recorded selections and consumed chips remain. The original correction interval restarts and prizes retain their normal finality holds. An injected publication failure rolls back the marker, result changes, review resolution, receipt and audit together. Identical concurrent confirmations produce one result revision.

## User and operator surfaces

Match pages provide bilingual disposition forms, official-reference history, shared impact and localized explanation. Result review links directly to the zero-performance preview and approval. Public playbooks and the admin handbook explain resumed/replayed matches and preserved transfer/chip effects. Existing theme tokens and RTL/fixed-sidebar layouts are retained.

## Migration and rollout

Migration 0023 adds retained fixture dispositions and scoped settlement approvals. Existing bare terminal statuses require evidence and are held rather than silently backfilled. Existing empty final results may surface review work under the stronger policy; operators must inspect and approve those cases.

Deploy matching web/worker builds before accepting new awarded-status fixtures. Older code does not understand the new awarded fixture status or settlement policy; a code rollback after using these capabilities must target a compatible release. Do not describe this behavioral change as a universally backward-compatible rollback, erase recorded decisions or blindly reverse the migration.

## Verification

Strict types and typed lint pass. PostgreSQL coverage proves direct-status denial, global scope, repeatable rollback-only previews, stale review rejection, concurrent confirmation, persistent dispositions, retained original reports/final revisions, failed settlement rollback, negative transfer totals, consumed-chip preservation, explicit release and cumulative restoration, replay identity/deadline validation, and administrative scores without invented performance. The retirement scenario now explicitly settles its deliberately empty rounds.

The full local verification passed: 116 unit/harness cases, 128 PostgreSQL cases (9 persistence + 119 application), 56 public smoke combinations and authenticated English/Arabic E2E. Browser proof exercises reviewed awarded results, explicit zero-performance publication, retained snapshots and release/restoration. See artifacts/verification/exceptional-fixtures-proof.json for current-source evidence. Protected CI on the exact PR head remains required before merge. The broader release gates are tracked in [production readiness](production-readiness.md).
