# Slice 14 — Verification recovery and bounded requests

Implemented and verified, 2026-09-19. No database migration.

The sign-in screen links to a bilingual verification-email recovery form. It requests a fresh one-hour link, keeps a generic response for unknown or already-verified addresses and retains the provider's authentication rate limits. Browser verification uses the newly written local message, confirms that it activates the account, and covers the Arabic mobile screen.

Authentication, participant, staff and staff-challenge HTTP handlers now enforce byte limits while reading the stream. Declared content lengths cannot bypass the limit, Arabic multibyte content counts as bytes, and an oversized stream is cancelled. A focused test covers exact limits, multibyte input, dishonest Content-Length and cancellation; the browser confirms an oversized authentication request receives HTTP 413 while ordinary signup, verification, password reset and MFA still work.

Session lookup also rejects an orphaned identity with no application account. Full formatting/lint/types/build/unit checks and browser workflows pass. The browser initially filled the previous route before navigation finished; the test now waits for the recovery route and heading before submitting.
