# Slice 20 — Consensual group ownership handover

Implemented and verified 2026-09-19. Migration 0017 is applied locally and immutable.

Organizers can offer ownership to an active member with an active squad. The seven-day offer is visible only to the current organizer and recipient, can be replaced/cancelled/declined, and requires the recipient's explicit acceptance. Acceptance rechecks membership, squad, account, current group revision, expiry and the account's 20-group organizer limit. It changes ownership exactly once, revokes old invitation codes and preserves membership, scoring, schedules and prizes. No external messages are sent.

The Arabic/English group page provides reviewed offer and acceptance controls. Full checks pass; disposable PostgreSQL passes nine persistence and 53 application cases/subcases. Full Chrome verification passes a real two-account handover, authority removal from the former organizer, invitation invalidation, a return handover and Arabic mobile layout. Screenshot artifacts are `group-handover-en.png` and `group-handover-ar-mobile.png`.

Account closure and erasure remain separate work. See [handover design](group-handover-design.md).
