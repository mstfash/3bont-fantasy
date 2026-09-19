# Slice 08 — Achievements

Implemented and verified 2026-09-19. Migration 0009 is applied locally and immutable.

Administrators create bilingual cosmetic badges for squad activation, positive final rounds, point thresholds, shared rank thresholds and consecutive finalized rounds. Account participation badges deduplicate multiple squads; gameplay badges retain squad attribution. Icons and styles use the existing theme tokens.

Published definitions are immutable except future retirement. New versions close the previous version's future window, never rewrite locked rounds, and cannot remove activation grants already earned for an upcoming round. Explicit confirmation is required for retrospective publication of the first version. Unknown, provisional or reviewed rounds cannot complete a streak. Reconciliation grants once, revokes when evidence no longer qualifies, and restores the same identity and first award date when corrected results qualify again.

The worker reconciles after result publication. Staff can request an audited reconciliation. Participants have a public definition catalogue, private dashboard collection and earned badges on permitted score pages. No achievement changes budgets, points, chips or prize eligibility.

Verification: `pnpm check` passes (63 domain/authorization/date tests), disposable integration passes 9 persistence and 26 application cases/subcases. Chrome passes creation, publication, catalogue, reconciliation and English/Arabic mobile collection screens; the Arabic screenshot was visually inspected. Tests cover duplicate and concurrent reconciliation, account attribution, revoked/restored history, upcoming activation protection and unchanged squad state.

Continue group chat/moderation, sponsors, support/privacy, prize correction cases and provider/operating gates; this is not a complete launch claim.
