# Slice 19 — Participant profile and private game-data exports

Profile and archive implementation, 2026-09-19. Migration 0016 is applied locally and immutable.

Display names update identity and game records atomically with optimistic concurrency and command retry protection. Account IDs accept the identity provider's string format. The generic identity update endpoint is disabled, and receipts/audits do not retain previous names.

Participants can request background NDJSON archives of their own game data, optionally filtered by competition and historical dates. A repeatable-read build pages every included section, commits all chunks with their checksum together, and enforces 100 MB/60-second build limits. Downloads require the owning active account and expire 24 hours after completion. Only one queued request and three requests per rolling day are allowed. Credentials, invitation tokens, other participants' private records and restricted moderation evidence are excluded. A dedicated minute worker queue reports archive outcomes through worker health.

Full formatting, typed lint, strict types, build and 68 unit checks pass. Disposable PostgreSQL passes nine persistence and 52 application cases/subcases, including concurrent requests/builders, multi-page Unicode content, ownership, scope, checksum, oversize rollback, expiry and synchronized identity names. Full Chrome verification passes request/build/download, identity synchronization, disabled bypass, anonymous denial, checksum/size, expired downloads and Arabic mobile layout; no production privacy-compliance claim is made. Account closure, pseudonymization and published retention terms remain separate work.
