# Slice 13 — Post-delivery prize corrections

Implemented and verified, 2026-09-19. Migration 0013 is applied locally and immutable.

The worker reconciles fulfilled prize proposals after scoring. Changed finalized results, required review, or changed sporting eligibility creates a durable case instead of changing a fulfillment receipt. Concurrent workers share the competition lock and cannot create duplicate open cases. An open case follows new evidence through numbered immutable observations; a changed situation after resolution creates another case and preserves the prior decision.

Evidence comparison explicitly orders fields and omits cosmetic squad names. Database JSON field ordering and a rename cannot manufacture a dispute. Cases retain their original proposal reference and current sporting allocation, with before/current recipients and prizes in the administration screen. The directory flags open cases. Latest observation history is bounded to 100 records per pool; all observations remain persisted.

A current scoped prize approver with recent MFA can record that the original delivery stands or that a documented external remedy was completed. The actor must be different from the original preparer and every original/current recipient. Resolution binds the displayed case revision and evidence fingerprint, rechecks live evidence, and waits for complete finalized evidence. Role revocation or account suspension cannot race this decision. Neither action sends money, recovers an award or changes the original delivery record.

Public prize pages retain the original delivered recipients, show pending review, and disclose a completed correction review without exposing restricted decision evidence. An unobserved newer change immediately restores the public hold even before the worker updates the case.

Disposable PostgreSQL tests pass concurrent reconciliation/retries, cosmetic renames, two-person and recipient restrictions, stale evidence, current authority, unresolved rounds, evidence history, re-opening after a resolution, external-remedy recording, public status and immutable delivery receipts. Full checks and bilingual browser verification pass, including a corrected tie, independent decision, preserved delivery receipt, public disclosure and Arabic mobile layout.
