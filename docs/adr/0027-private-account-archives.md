# ADR 0027 — Private account archives

Accepted 2026-09-19. Build owner-scoped NDJSON archives in a repeatable-read background transaction, commit bounded chunks and a checksum atomically, and require owner authentication for downloads that expire after 24 hours. Authentication secrets, invitations, other participants' private choices and restricted moderation evidence are excluded; this game-data archive does not replace exceptional privacy-request handling.
