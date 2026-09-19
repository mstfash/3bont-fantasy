# Slice 21 — Reviewed account closure

Implemented and verified 2026-09-19. Migration 0018 is applied locally and immutable.

Participants review retained entries, owned groups, staff grants, unsettled assigned prizes, open correction cases and the messages/archives to remove. Closure requires resolved blockers, a fresh sign-in, the current review fingerprint and an explicit final confirmation. It marks the account closed, neutralizes public account/squad names, removes ordinary message content, purges archives and credentials and revokes all sessions. Historical lineups, results, memberships, restricted expiring moderation evidence and fulfillment receipts remain.

Closed state is checked by participant commands, private reads, identity sign-in, staff access/grants, account moderation and export workers. Moderator/support pages distinguish closure from suspension. Historical prize verification survives credential deletion; public award names use closed-entry pseudonyms while the original fulfilled evidence remains intact. The owner bootstrap now uses the identity connection schema and the same staff-management lock, with a closed-account check.

Full typed build checks and 68 unit tests pass. Disposable PostgreSQL passes nine persistence and 55 application cases/subcases, covering blocked/stale reviews, old authentication, concurrent closure, erased ordinary content, retained restricted evidence, historical scoring/prize eligibility and connection-scoped owner bootstrap. Chrome passes the full suite including active-entry blocking, reviewed closure, archive/credential purge, revoked access and Arabic mobile layout. No real participant was closed by these development tests.

This implements account closure and public pseudonymization. It does not establish a legal erasure response, approved retention terms, backup expiry or external support procedures; those remain launch evidence gates. See [closure design](account-closure-design.md).
