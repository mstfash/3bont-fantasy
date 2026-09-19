# Fixtures, result revisions and corrections

Q09b/Q13/Q14/Q16 plus D01/D13. The football provider's “finished” flag is not a finalized fantasy result.

## Fixture disposition

| Situation                                                        | Selected behavior                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delay within the same gameweek                                   | Keep assignment and locked snapshot.                                                                                                                      |
| Wholly unplayed, postponed to later round                        | Audited reassignment to a future unlocked gameweek; use its snapshot, remove contribution from original round, never count twice (Q09b).                  |
| Suspended after play, later resumed as the same official fixture | Keep original assignment/snapshot; combine the resumed segments once. Original round remains unsettled.                                                   |
| Officially voided match, fully replayed                          | Retain void evidence, zero its contributions, and assign the new replay fixture to an unlocked future round. Do not reuse already scored partial events.  |
| Official cancellation with no play/replay                        | Authorized void disposition supplies zero contribution and permits settlement.                                                                            |
| Awarded result without footballer performance data               | Review; do not invent appearances, goals or clean sheets from an administrative team score. Explicit zero-performance disposition is required.            |
| No unlocked destination exists                                   | Escalate to review; default retain original assignment/snapshot and await play, or use evidenced official void. Never auto-create a retroactive deadline. |
| Empty gameweek after all reassignment/voiding                    | Explicitly settle at or after its deadline; zero performance, normal transfer costs/chip consumption, correction window still applies.                    |

A disposition and identity map retain the original fixture, replacements, effective assignment revision and reason. Season phases/round names are provider inputs, not automatically fantasy gameweek IDs. A future-season competition is a new edition with fresh entries/resources; templates may be cloned, historical scores may not.

## Settlement and publication

Fixture settled means a supported terminal disposition plus all required scoring inputs validated, with no blocking issue. A material scoring/assignment correction resets the gameweek correction timer to the latest material change or last fixture settlement, whichever is later. Identical payloads and cosmetic changes do not reset it. Default interval is 24 hours (Q14). Missing minutes are missing data, not zero.

Lifecycle: scheduled → locked/live → provisional-complete → finalized. A blocked issue prevents finalization. A late correction creates a review case while the existing finalized revision stays visible with a review indicator. Authorized reopening → recomputation → preview → coherent new publication. Failed computation leaves the previous published revision intact. Reopening starts a fresh correction window before the replacement is finalized.

Every result revision records fixture fact revisions, overrides, assignment/rule versions, entry snapshots, transfer ledger and calculation version. Publish a complete competition revision only after all required projections for that scope are ready. H2H and achievement views either show that revision or an explicit pending state; never silently mix revisions. Finalization and reopening serialize with award approval to avoid payouts against superseded results.

## Override ownership

Real-world facts have season/fixture scope. A data steward correcting scorer A to B previews all affected Fantasy Competitions. Save the underlying provider observations and the persistent override separately. Routine synchronization cannot remove it (Q16). Unresolved disagreement remains visible; an explicitly reviewed override can resolve the blocking data issue despite the provider still disagreeing.

Provisional games recalculate using the effective fact. Finalized games each receive a review case and retain their published snapshot until authorized reopening. Thus current football facts can differ from the fact revision of a historical finalized game, visibly and intentionally. Different fantasy scoring belongs in game rules, not a private rewrite of who scored the real goal.

Removal is an audited action revealing the current provider fact and triggering the same fan-out. A competition manager cannot edit global facts without the data-steward permission. An emergency historical participant-snapshot repair requires original accepted-command evidence, owner permission, impact preview and explicit reopening; no discretionary post-deadline team optimization.

## Downstream effects

| Consumer                  | On approved revised final results                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Overall/classic standings | Recompute affected totals and ranks; keep prior revision explorable.                                          |
| H2H                       | Recompute the affected matchup and edition table from the same net points; do not reshuffle opponents.        |
| Achievements              | Recompute, revoke no-longer-earned awards with visible reason, preserve audit.                                |
| Unfulfilled prizes        | Freeze approval/fulfillment during review; invalidate stale proposals and recalculate.                        |
| Fulfilled prizes          | Create a discrepancy case for operator resolution; never silently claw back payment or erase fulfillment.     |
| Fantasy prices            | Do not rewind transactions or prior published price batches; use corrected inputs in the next eligible batch. |
| Notifications             | Use deduplicated correction notices; no repeated congratulation emails on job retries.                        |

Material correction scope, old/new totals and affected prize cases must be visible before publication. No catch-all “recalculate everything” button without a bounded preview.

A fulfillment correction case records an independent prize approver's decision against the exact current evidence. The original delivery may stand, or a completed external remedy may be recorded with evidence; the app never assumes that a corrected allocation authorizes a payment or recovery. Pending evidence cannot close a case. Further evidence after a decision creates a new case, preserving earlier decisions and delivery history. Cosmetic squad renaming is not a prize correction.
