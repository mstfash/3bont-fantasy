# Slice 33 — enforced CI and reviewed match timelines

## Delivery

The initial verified checkpoint is `d7ca961`, published to the supplied GitHub repository. Main protection requires an up-to-date pull request and the GitHub Actions `Required checks` gate, including for administrators. Force pushes and deletion are disabled. Raw conversation archives, local secrets and generated browser captures are excluded. Gitleaks and comparison against the actual local credential values found no staged secrets.

The first remote run passed secret scanning and Linux container proof but exposed a missing scored-replay prerequisite in browser CI. PR 7, now merged after all remote checks passed, adds the existing local-only replay before browser acceptance and avoids duplicate development-branch push/PR runs. The gate rejected the failed baseline as intended. See [CI operations](continuous-integration.md).

## Match processing

`provider-event-timeline.ts` reconstructs ordinary full-time participation from two complete starting elevens and mapped events. It counts goals against players while active and after dismissal, preserves the distinction between a normal substitution and a sending-off, and distinguishes second-yellow dismissal from a separate yellow and straight red. Substitution direction is resolved only when exactly one of the two identified players is currently on the pitch and the incoming player has not appeared before.

The resolver checks event totals against the final score and playing intervals against reported minutes. It handles first-half and full-time stoppage timestamps as ordered football-clock pairs. A goal sharing a recorded instant with a substitution/dismissal cannot acquire an invented order from JSON array position. Duplicates, VAR records, unsupported event details, unknown identities, missing clocks, unreported participation, re-entry, shootout timing and contradictory aggregates remain review cases.

The draft adapter uses coherent timelines for own goals, penalty misses and defensive facts. Card totals must corroborate card events; disagreements withhold the affected player's derived fields. Goalkeeper saves remain unknown unless both save totals and penalty-save totals are supplied consistently. Penalty saves are included in the supplied total saves, not added a second time, and team goalkeeper totals cannot exceed the opposing missed-penalty events. A reported penalty-miss total must match the event count before becoming a draft fact.

Arabic and English staff explanations identify the new timeline holds. Source attempts/mappings and the reviewed-report transaction remain the authority for storing a draft. `factsComplete` and `eligibilityComplete` still start false: this change does not authorize automatic acceptance, infer unused-bench minutes, establish historical eligibility or prove target-season provider semantics.

## Regression evidence and limits

Twenty timeline cases and three adapter cases cover 59/60-minute substitutions, stoppage time, both red-card policies, paired second yellows, own goals, penalties, same-time ambiguity in both payload orders, duplicates/VAR, missing fields, impossible participation and save-count disagreement. Existing fixture-scoring tests verify clean-sheet thresholds, dismissal deductions and saves without double counting. All 31 application unit cases pass with type checking and lint.

The resolver intentionally holds whole timelines when participation or score evidence conflicts. Unknown or contradictory dismissal totals hold the entire timeline; a yellow-card-only disagreement with a corroborated dismissal total withholds the affected player. Exact minute reconciliation is conservative: alternative provider conventions at stoppage boundaries require licensed examples and an explicit adaptation, not a guessed tolerance. Own-goal event team attribution must agree with the beneficiary inferred from the mapped actor. Alternate provider encodings remain review cases pending validation.

Golden fixtures here are synthetic. The free key cannot access 2026/27; no further live API calls were made. Automatic report acceptance, cross-competition correction projections, historical rule replay and production recovery evidence remain open in the [execution plan](release-execution-plan.md).

Full local verification passed: 108 unit/harness cases, 83 PostgreSQL cases, 56 public smoke combinations and authenticated E2E. The final dismissal-total safeguard separately passed application type checking, lint and 31 unit cases. See [the scoped proof record](../artifacts/verification/timeline-proof.json); remote PR CI checks the final complete tree.
