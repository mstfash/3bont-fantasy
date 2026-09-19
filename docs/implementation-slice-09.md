# Slice 09 — Group conversation and moderation

Implemented and verified 2026-09-19. Migration 0010 is applied to the persistent local database and is immutable.

Groups have an optional plain-text room, disabled initially. Current verified members use their account identity irrespective of squad count. Organizers configure bounded message length and posting limits; the defaults are 1000 UTF-16 units (matching browser input limits), 5 messages per 10 seconds and 60 per hour. Counts include messages posted in other rooms and deleted messages. Account locking serializes concurrent attempts. Message content is rendered as text, never markup or automatic external embeds; control and bidi override characters are rejected.

Participants can delete their own public text, report another message, mute automatic updates and block an account in their own view across rooms. Blocking does not prevent a person reading shared-room content. Receipts contain only references and a request hash. Group organizers can remove content, apply/lift room posting timeouts of up to 30 days and resolve reports with a reason. Staff moderators use competition scope and current MFA; organizers receive no platform-wide suspension power.

Every read/write checks current membership or moderation authority. Cursor pages contain at most 50 messages. Foreground polling backs off on failures, pauses hidden tabs, and clears the room after denied access. Muting pauses automatic updates; explicit refresh and returning to the visible tab still check access. All actions require server confirmation, and uncertain posts retain the same retry identity.

Messages expire after 90 days. Reports, removal evidence and moderation reasons are restricted and expire after 180 days. Reads enforce expiry even if the hourly cleanup job is delayed. Permanent audit records retain action references without message content or free-text moderation reasons. Account erasure/retention exceptions still require the dedicated privacy implementation and published policy before production.

Database verification passes 9 persistence and 27 application cases/subcases, including concurrent cross-room rate limits, idempotency, blocking, report evidence after deletion, scoped review, membership removal, cursor boundaries and retention. Full lint/type/build/unit checks pass. Chrome passes room enablement, safe literal text, report/block/unblock/mute, author deletion and organizer removal with retained evidence; English and Arabic mobile screenshots are saved and the Arabic layout was visually inspected.

Remaining: platform-level account suspension/support workflow, sponsors, privacy, prize correction cases, provider/calibration and operating evidence. No live users or messages were contacted during verification.
