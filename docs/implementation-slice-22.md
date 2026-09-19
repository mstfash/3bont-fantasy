# Slice 22 — Current authority for staff writes

Implementation 2026-09-19, no new migration. Reviewed staff mutations now reload current account state and scoped grants under a shared staff-management transaction barrier. Role changes, closure and suspension use its exclusive counterpart. Organizer moderation remains available; staff moderation requires current grants. Command retries do not bypass revoked authority.

Full checks and 68 unit tests pass. Disposable PostgreSQL passes nine persistence and 56 application cases/subcases, including new lock-wait/revocation/freshness tests. Browser regression passed against the hardened build, including MFA sign-in and rejection of an old session proof. The browser harness honors the configured sign-in rate limit. See [authorization boundary](staff-write-authorization.md).
