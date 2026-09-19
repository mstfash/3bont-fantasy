# Slice 36 — shared match review and the home gameweek board

## Home and published results

Home now shows the first five overall squads, points contributed by the latest published gameweek, and movement compared with the table through the preceding gameweek. New entrants have no invented previous rank. Both tables use the canonical ranking policy; ties remain ties and negative scores remain visible. Full overall rankings retain movement, while gameweek links open a separate round table and preserve the selected round on squad-score links.

The featured pitch shows the highest-ranked squad in the latest finalized gameweek. Joint winners are named as joint winners and can be selected individually. It uses the immutable deadline squad and published scoring lineup after automatic substitutions, with a separate bench, captain badge, shirt numbers, names and points ledger. Bench Boost counts reserves without drawing a fifteen-player formation. Shirt numbers are optional catalogue metadata; unknown numbers remain a dash and current metadata is distinguished from historical scoring. Draft competitions and editable future selections are never returned by the public readers.

Winner announcements are withheld when source facts are stale, results are incomplete or a review remains open. A gameweek points winner is not a prize-payment decision. Synthetic data is labeled explicitly. The board refreshes database-backed published results every minute while visible, pauses automatic refresh while editing a selector, and includes manual refresh and a last-checked time. It makes no provider requests. English/Arabic, RTL, light/dark themes and localized explanations use the existing design tokens and help controls.

## Pre-write shared correction review

The staff match endpoint now requires preview then confirmation. Preview executes the canonical report/override mutation inside a transaction, computes consequences across every assigned competition/gameweek, and rolls back the mutation, evidence, audit and command receipt. Confirmation repeats that exact calculation and rejects changed dependencies. The reviewed fingerprint and affected counts are audited on application. Identical retry receipts prevent duplicate writes after an uncertain response.

The summary reports affected squad/rank counts, classic groups, H2H editions and prize pools. Competition scope controls which competition summaries are visible; hidden competitions still participate in the fingerprint. It does not reveal private group identities or financial recipient details. Detailed scoped projections and historical reopening retain their existing separate workflow. Accepting match facts never silently reopens final results or rewrites delivered awards.

A shared assignment barrier in competition setup prevents a new assignment appearing during review. Review locks affected-season competition parents in stable order and shares fixture locks throughout the season so prize windows remain coherent. Existing staff authority, account eligibility and result publication barriers remain in force. Upcoming gameweeks report that no locked squad projection is available rather than inventing one.

## Verification

The regression suite covers repeatable rollback-only previews; restricted cross-competition dependencies; reassignment and concurrent confirmation; exact retry receipts; public score aggregation; negative movement; tied winners; unannounced revisions; future-lineup privacy; unknown jersey numbers; missing-result holds; Bench Boost geometry; and public access boundaries.

Browser acceptance covers the anonymous home board in both languages and themes, mobile RTL overflow, localized help, database refresh, short/full lists and gameweek-specific pitch links. Existing authenticated correction acceptance now confirms the global preview. Full local verification passed: 116 unit/harness tests, 113 PostgreSQL cases, 56 public smoke combinations, anonymous home-board acceptance and authenticated E2E, including strict types, lint and production builds. The broader suite caught and verified a fix for signed-in mobile navigation overflow. See the [source-bound proof](../artifacts/verification/live-home-proof.json). Required remote CI additionally runs Linux containers before merge.

## Remaining gates

Controlled historical rules replay and exceptional fixture handling remain open. Live 2026/27 provider entitlement, licensed valuations, staging, measured load/recovery and the final operator rehearsal remain release gates. This slice does not claim live Egyptian league ingestion or production readiness.
