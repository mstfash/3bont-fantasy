# Slice 10 — Support and account moderation

Implemented and verified 2026-09-19. Uses existing account/session/audit tables; no new migration.

Support staff can search squads within their competition scope and inspect activation/status, revision, editing-round label, snapshot count, published results and open result reviews. Queries project only these operational fields. They never retrieve current footballer choices, bank, captain, transfers, email or authentication secrets.

Platform moderators and owners can review a temporary account suspension or restore access, with a recorded reason and evidence reference. Competition-only moderators cannot suspend an entire account. Decisions use the database clock, an expected prior state and idempotent receipts; the suspension limit is one year. Role changes and suspensions share the platform staff-management lock, and authority is reloaded inside the transaction. Accounts holding staff grants are protected: an owner must manage those grants first, preserving existing last-owner safeguards.

Suspension/restoration revokes existing identity sessions and staff proofs atomically. New sign-ins are rejected while suspension is active, with a localized message. Expiry permits a fresh sign-in; restoration never resurrects a revoked session. Squads, results and moderation evidence are preserved. Existing prize eligibility checks see current suspension state and invalidate affected proposals.

Verification: the full formatting/lint/type/build/unit checks pass; disposable PostgreSQL passes 9 persistence and 30 application cases/subcases. Tests cover concurrent retries, stale decisions, revoked/scoped authority, protected staff, session revocation, fresh sign-in after restoration and support projections without private gameplay/authentication fields. Chrome passes the support desk in English/Arabic mobile, staff room queue and reviewed suspension/restoration. Screenshots are under artifacts/web/admin-support-* and admin-account-review-en.png.

Remaining launch work includes sponsors, participant profile/privacy/retirement, durable prize correction cases, provider/bulk import/calibration, exceptional fixtures/historical replay and measured deployment evidence. This is not a full release-completion claim.
