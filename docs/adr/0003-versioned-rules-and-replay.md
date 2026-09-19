---
status: accepted
---

# Version rules and retain evidence for deterministic replay

Admin-editable scoring and corrected match facts can change already published results. Prefer immutable ruleset revisions, locked lineup snapshots and auditable score revisions over updating mutable point totals in place, so a published result can be explained and reproduced.

## Consequences

This adds storage and explicit publication states but makes repeated ingestion and correction recovery testable. It does not select full event sourcing. Replay must not silently pick today's rules for yesterday's matches. Q14/Q16 and D01/D13 now resolve finality, override precedence and downstream effects in [result lifecycle](../result-lifecycle.md).

Q13 acceptance (2026-09-18): publish scoring changes as new versions for future unlocked gameweeks by default; locked rounds keep their effective version. Historical changes use a separate explicitly scoped admin recalculation with an impact preview and audit trail. Ordinary edits never silently rewrite history.
