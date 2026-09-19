---
status: accepted
---

# Lock squads once per gameweek

The user selected one deadline for the entire gameweek instead of per-fixture locking or supporting both modes at launch (Q09, 2026-09-18). Start with a configurable offset of 90 minutes before the first kickoff and preserve the squad/lineup snapshot for that gameweek; subsequent edits apply to the next gameweek.

This chooses one shared selection cutoff over continuous lineup management and avoids introducing mixed lock semantics into the first release. Q09a/Q09b below refine cutoff and unplayed-fixture postponement. [Game rules](../game-rules.md), [configuration policy](../configuration-policy.md) and [result lifecycle](../result-lifecycle.md) define pre-lock edits, snapshots and exceptional fixtures.

Q09a refinement (accepted 2026-09-18): the server must validate and accept the action before the deadline; client click time cannot bypass it. Late requests for a locked gameweek are rejected, not silently retargeted to the next round. The implementation must define an atomic acceptance point so delayed lock jobs or in-flight writes cannot bypass this rule.

Q09b refinement (accepted 2026-09-18): an unplayed fixture postponed beyond its original gameweek is reassigned by an audited admin action to a future gameweek before that destination locks. It uses the destination lineup, allowing blank/double gameweeks without reopening the original lineup. A delay within the same gameweek does not trigger reassignment.
