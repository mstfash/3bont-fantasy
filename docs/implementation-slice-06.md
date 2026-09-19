# Slice 06 — Configuration lifecycle and staff operations

Implemented 2026-09-19; browser verification passed.

Structural edits are validated against the published player pool and every retained squad/baseline before the first deadline. Already allocated starting budgets cannot change; the first elapsed deadline freezes structure even when the deadline worker is delayed.

Transfer rules and chip enablement changes for activated entries require an explicit future round whose editing period has not opened and at least 48 hours' notice before that opening. Chip windows and original inventories remain frozen after activation. Later schedules cannot move ahead of an announced economic transition. Changes apply by category: an unrelated scoring edit cannot pull future transfer costs into the current editing round. Rollover charges the outgoing policy and grants the incoming allowance/cap. Other material changes defer past rounds with less than 48 hours' notice.

Equal chip grants have bilingual public announcements, a future unopened gameweek, immutable amounts and exactly-once receipts per entry. Rollover adds the grant after consuming any outgoing chip; new entries starting in the target round receive the same grant. Later entrants receive no historical grants. Initial inventory plus announced grants is bounded to 25 uses per chip type in this release. Subsequent calendar/rule edits cannot invalidate the notice period or promised chip availability. Migration 0007 is applied locally and immutable.

Participants can inspect each gameweek's rules version and all announced grants. Existing gameweeks retain their scheduled rules during fixture/calendar edits; calendar extensions inherit the neighboring schedule rather than accelerating future economic changes. Prices use the target gameweek's policy.

Owner-only staff administration supports the eight accepted roles, platform/competition scopes, account search, reviewed grants/revocations and recorded reasons. Owner and shared football-data roles require platform scope. Every write requires recent password/MFA verification, reloads current actor authority under a platform-wide role-management lock, and invalidates the target's staff proofs. Concurrent removals cannot eliminate the last verified, unsuspended, MFA-enabled owner. New grants require an identity account with verified email, and owner grants require MFA enrollment. A grant itself sends no invitation or message.

Verification: 61 domain/authorization/date tests; 9 persistence and 20 application database cases/subcases. Strict lint, source/test type checks and production build pass. Chrome verification passed for role grants/revocations, public grant publication, versioned rules, and Arabic mobile layouts. Evidence is in artifacts/web/admin-staff-* and rules-grants-*.

Remaining launch work includes prizes, achievements, chat/moderation, sponsor operations, scoped support investigation, provider/bulk imports, price calibration, exceptional fixture handling, historical replay, privacy operations and release evidence. These are not represented as complete by this slice.
