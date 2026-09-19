# Private game-data archives

Selected implementation, 2026-09-19. The participant requests an authenticated archive of their own game data, optionally narrowed to one competition and a history date interval. Profile/current preferences are included alongside the requested historical scope. An archive explicitly identifies its scope; missing sections are not silently represented as a complete legal access response.

Build archives asynchronously on a dedicated durable worker queue. Each build uses one repeatable-read snapshot, pages records in stable order and stores immutable NDJSON chunks in PostgreSQL. Publish the ready state and chunks together; an interrupted build exposes no partial download. Bound individual builds to 100 MB, reject oversize archives explicitly and allow narrower competition/date requests. Keep at most one queued archive per account and accept up to three requests per rolling day. Retries of the same request reuse its archive.

Include the owner's profile, entries/current choices, locked snapshots, published entry results, memberships/history, own unexpired messages and chat preferences, achievements and only their own fulfilled award allocations. Omit credential/session/verification tokens, invitation secrets, other participants' private choices, unpublished prize proposals and restricted third-party moderation evidence. Retain operational audit records separately according to operator policy.

Downloads require the same active, verified account; there are no anonymous or reusable signed public links. Stream committed chunks with a checksum and explicit format/version metadata. Ready archives expire after 24 hours and expired/failed requests are cleaned up; suspended or closed accounts cannot download an existing archive. Build errors receive safe status codes, not raw database messages.

Profile edits, account closure and erasure are separate workflows. Closure must invalidate and purge pending/ready archives while preserving necessary competition evidence. External legal/privacy terms, identity verification for exceptional requests and backup retention remain launch gates.
