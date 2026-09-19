# Acceptance scenario catalogue

Executable acceptance targets, not tests already run. Expected behavior comes from current game-rules, pricing-policy, configuration-policy, result-lifecycle and module-specifications. Historical rows below are refined by later Q/D decisions.

| ID  | Given / when                                            | Required outcome                                                                              |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A01 | Same normalized provider payload arrives twice          | No duplicate points or repeated user-side effects                                             |
| A02 | A scored goal is changed to an own goal                 | Correct affected scores; retain evidence and publication revision                             |
| A03 | Provider removes a previously seen event                | Recompute from authoritative normalized state; no orphan points                               |
| A04 | Admin correction exists and provider repeats old data   | Apply the agreed precedence, preserve audit and reveal discrepancy                            |
| A05 | Scoring rule changes after a match                      | Use the explicitly chosen effective revision; historical replay is deliberate                 |
| A06 | Worker crashes after facts commit, before job dispatch  | Dependent work eventually runs once in effect                                                 |
| A07 | Recompute crashes after half the participants           | Public rankings remain on one coherent revision                                               |
| A08 | Two transfers compete for remaining budget              | Transactional outcome cannot overspend                                                        |
| A09 | Lost transfer response triggers client retry            | Same action/result once; changed payload with same key rejected                               |
| A10 | Transfer starts before deadline, commits after          | Enforce the agreed server-side lock rule atomically                                           |
| A11 | Captain has zero minutes, vice is unavailable           | Agreed fallback and bench logic; no inferred rules                                            |
| A12 | Postponed fixture moves across rounds                   | Explicit fixture-to-gameweek and lineup-snapshot policy                                       |
| A13 | Club transfer creates an over-limit squad               | Agreed grace/repair policy; no silent penalty invention                                       |
| A14 | Price changes after purchase                            | Separate purchase/current/selling price and deterministic budget accounting                   |
| A15 | Many workers reserve the last quota slots               | No managed network attempt without an atomic valid reservation                                |
| A16 | Timeout, pagination and repeated 429 responses          | Every attempt accounted, bounded backoff, no request beyond cap                               |
| A17 | Budget store unavailable or process restarts            | Provider calls fail closed; durable count retained; local reads continue                      |
| A18 | Provider key used elsewhere                             | Detect/reconcile or prohibit; no unconditional quota guarantee                                |
| A19 | No matches today, or match runs beyond window           | Agreed discovery and overrun behavior; freshness status visible                               |
| A20 | Cairo time change / provider daily reset                | No double reset or missed scheduled deadline                                                  |
| A21 | Provider returns malformed or missing statistics        | Runtime validation and quarantine; missing is not automatically zero                          |
| A22 | Unauthorized admin toggles a feature                    | Denied consistently; no partial change                                                        |
| A23 | H2H has odd members or a correction changes winner      | Agreed bye/schedule/revision behavior                                                         |
| A24 | Prize winner changes after announcement                 | Agreed finality/approval/fulfillment policy, attributable intervention                        |
| A25 | Achievement input is corrected                          | Agreed revoke/recompute policy                                                                |
| A26 | Chat user loses league membership                       | Agreed visibility/moderation/retention restrictions                                           |
| A27 | Arabic/English and mixed names on narrow screen         | Correct reading direction, usable controls and explicit fallback                              |
| A28 | Entire VPS is lost                                      | Restore off-host data and explain attainable data-loss/downtime limits                        |
| A29 | Several games use one real fixture with different rules | Independent scores without duplicated provider polling                                        |
| A30 | Staff scope differs between two fantasy competitions    | Single-operator permissions protect other games; independent tenant support is outside launch |

Testing layers: pure domain examples and properties; adapter contract tests from redacted payloads; database race/integration tests for locks/idempotency/outbox; end-to-end user/admin paths; job fault injection; operational restore and load drills. Unit coverage alone cannot prove concurrency correctness or provider quality.

**A31 — Entry limits (accepted Q06/Q06a):** with cap 3 and an account holding 3 entries, reducing the cap to 1 must fail without modifying entries or scores. Concurrent creation and cap changes must leave both the configured cap and all account entry counts consistent; duplicate/retried creation cannot bypass the cap.

**A32 — Late registration (accepted Q06b):** a new or additional squad created inside the registration window receives zero historical points and can score only from the next eligible gameweek whose deadline is open. A cap increase never permits registration outside the configured window; creation at a deadline must use authoritative timing and agreed locking semantics.

**A10 refinement — Deadline acceptance (Q09a):** an action clicked before cutoff but received/accepted after it is rejected for that gameweek. A delayed lock job must not admit late actions; a late request must never silently mutate the next gameweek. Test the atomic acceptance boundary for concurrent writes and a request spanning the cutoff.

**A12 refinement — Postponement (Q09b):** move a wholly unplayed fixture from locked Gameweek 5 to unlocked Gameweek 8 through an audited assignment. Its points use Gameweek 8's snapshot and never count twice. Reject normal reassignment into an already locked destination; a same-gameweek delay does not move it.

**A11 captaincy refinement (Q10):** a captain with zero minutes and a vice who plays triggers vice multiplication; both zero means neither multiplies. Captain playing in either fixture of a double gameweek prevents fallback. Negative points are multiplied, disabled captaincy applies no multiplier, and incomplete participation data must not be silently interpreted as zero minutes.

**A33 — Auto-substitutions (Q10a):** test GK-for-GK, multiple absent outfield starters, ineligible early bench choices, preserved formation and zero-minute reserves. A starter who plays in either fixture of a double gameweek cannot be replaced; negative points do not trigger replacement. Missing minutes do not count as confirmed zero; disabled auto-subs retain the original lineup. Verify bench priority across all replacements rather than relying on unspecified iteration order.

**A34 — Chip inventory (Q10c):** two squads owned by one account have independent chip balances. Activating a chip cannot consume the sibling squad's balance. Reject concurrent attempts to activate two chips in one gameweek and reject use outside configured inventory/windows. Default grant is one of each enabled type, subject to the pending late-entry grant policy.

**A14 selling-price refinement (Q11a):** purchase 7.0/current 7.5 gives 7.2; current 6.8 gives 6.8; a 0.1 gain gives no realized gain under the default rounding. Two squads holding the same footballer at different purchase prices can receive different selling prices. Repeated rounding and request retries must not create budget value; Market Valuation changes alone do not affect selling prices.

**A35 — Transfer-chip allowance (Q11c):** start a Wildcard/Free Hit gameweek with three saved transfers and make more than three chip-covered transfers; no free-transfer consumption occurs and the next default balance is four. Starting at five remains five. Replayed transition jobs must not accrue twice, and configuration-specific caps/allowances must replace hardcoded defaults.

**A36 — Free Hit restoration (Q11d):** make A → B before activating Free Hit, then additional chip transfers; the following editable gameweek restores A and the previous-deadline bank/purchase prices. Waive the chip-gameweek transfer deductions/use, retain its temporary scoring snapshot, and preserve current published fantasy prices. Restoration retries must not duplicate balance changes or overwrite valid subsequent edits.

**A37 — Chip cancellation (Q11e):** cancel Free Hit before cutoff and restore the pre-activation state (B in the A → B example), with earlier normal costs; using it through cutoff instead restores A for the next gameweek. Wildcard cancellation retains the new squad and recomputes costs. Scoring-chip cancellation removes only the effect. Return inventory once, reject stale previews and reject participant cancellation at/after cutoff.

**A38 — Basic scoring (Q12):** distinguish zero, below-threshold and at-threshold appearances per fixture; never award both appearance tiers. Use correct position-specific goal values and assist counts under the effective rules. Two short appearances in a double gameweek do not combine minutes to cross a per-fixture threshold. Configured alternative thresholds/values must change results predictably.

**A39 — Defensive scoring (Q12a):** a defender normally substituted at minute 65 with no goal conceded keeps clean-sheet eligibility after a later goal; a minute-59 substitute does not meet the default threshold. Count conceded goals only during participation, per fixture, and floor deductions per configured group of goals. Missing event ordering must surface a data issue rather than fabricate a clean sheet.

**A40 — Card normalization (Q12b):** second-yellow dismissal totals −3, not −4/−5, while independent yellow plus straight red totals −4 under defaults. Duplicate paired provider events do not multiply deductions. A red-carded player earns no clean sheet even if the club concedes zero; GK/DEF receive applicable deductions for later conceded goals. Corrected dismissal classification recalculates deterministically.

**A41 — Save/penalty normalization (Q12c):** a goalkeeper with three total saves including a penalty save earns the configured ordinary-save point plus the penalty-save award. Do not inflate the save total by re-adding a penalty save already in provider totals. Apply missed-penalty/own-goal deductions and relevant defensive effects; shootout events produce no fantasy points.

**A42 — Result finality (Q14):** a finished last fixture alone does not finalize a gameweek. Wait the configured window and ensure required data/issues are resolved. A late correction creates review work without changing the finalized published revision. Audited reopening/replay creates an attributable revision; retries cannot duplicate publication or bypass unresolved issues.

**A43 — Ranking ties (Q15):** scores 100,100,90 produce 1,1,3 under the default. Pagination/display ordering cannot change rank or allocate a prize. An explicitly configured tie-break policy may change competitive rank; repeat calculations and pagination must remain deterministic with the same inputs/configuration.

**A04 override refinement (Q16):** manual scorer correction to B persists when later provider sync still reports A. Preserve both evidence and override, surface disagreement and respect finalized-result review boundaries. Explicit removal reveals the appropriate current provider fact and initiates the appropriate reviewed/provisional recomputation, with an audit trail.

## Delegated-decision acceptance targets

| ID  | Given / when                                                                              | Required outcome                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A44 | One shared fact correction affects provisional A and finalized B                          | Update A; retain B's published revision and create a scoped review. No duplicate polling or private factual fork.                                                        |
| A45 | A corrected final score changes H2H, achievement and an approved prize                    | Publish coherent ranks/outcomes, revoke invalid achievement, hold unfulfilled award; create discrepancy case for fulfilled award.                                        |
| A46 | Five entries join an H2H edition                                                          | Full cycle gives every entry equal match count and exactly one bye; insufficient rounds block schedule publication. Late entrants await next edition.                    |
| A47 | Two eligible entries tie across cash prize ranks worth 100 and 50                         | Allocate 75 each; one account's multiple entries cannot multiply awards under default eligibility. Nondivisible goods require the published resolution.                  |
| A48 | Moderator/data steward/prize preparer crosses permission scope                            | Reject unauthorized shared fact edits, other-game actions, self-approval and expired/revoked MFA sessions server-side.                                                   |
| A49 | Member is removed while a chat request is in flight                                       | Recheck access at authoritative read/write boundary; no later room pages or posts. Block/mute semantics and retention jobs match published policy.                       |
| A50 | Replay grants the same achievement / retry publishes the same campaign click              | Achievement award is unique by definition/version/scope; retry-deduped analytics follows documented counting rules.                                                      |
| A51 | Admin changes squad shape after first lock or while existing entries would become invalid | Reject; permitted future scoring version leaves earlier locked versions intact. Stale admin preview also fails.                                                          |
| A52 | An entry receives two configured Free Hits in consecutive rounds                          | Restore underlying permanent holdings each time, never promote prior temporary squad; preserve current published prices and exact acquisition ticks.                     |
| A53 | New late entry reaches first lock                                                         | Unlimited building, zero history; only eligible scoring chips; one ordinary allowance when following editing round opens, once despite retries.                          |
| A54 | Price batch races a transfer confirmation near deadline                                   | Either consistent old-revision confirmation before publication or stale-quote rejection; never mixed debit. No batch inside the configured freeze window.                |
| A55 | Repricing job repeats or old result is reopened                                           | No duplicate tick changes; prior transactions/banks unchanged; corrected inputs wait for eligible future batch.                                                          |
| A56 | VPS restored from backup predating provider calls                                         | Outbound traffic stays stopped until usage is conservatively reconciled/reset; restored counters alone cannot authorize calls.                                           |
| A57 | Delayed fixture continues after 23:00 Cairo / clock crosses DST                           | Follow fixture state and actual UTC deadline within daily/minute quota; show stale status if safe budget exhausted.                                                      |
| A58 | Raw provider omits minutes, duplicates second-yellow red or removes a goal                | Unknown remains unknown; normalized event identity prevents double deduction; deletion creates traceable changed facts.                                                  |
| A59 | Real club move causes four held footballers at one club                                   | Entry keeps scoring; next transfer batch must restore cap; no forced sale/hit. Historical affiliation remains explainable.                                               |
| A60 | Initial price suggestions leave no affordable valid formation                             | Block catalogue activation and show affordability evidence; admin edits require another validation. Missing valuation is visible, not a fake zero.                       |
| A61 | Provider marks a suspended fixture resumed or officially void                             | Correct disposition retains original lineup for resumed play, or removes void points and maps a new replay once. No fabricated individual points for awarded team score. |
| A62 | Opponent attempts to view an unlocked entry lineup or contact details                     | Public view exposes only last locked competitive snapshot; never current transfer plans, email, MFA or prize contact data.                                               |

Database races (A10/A31/A37/A44/A45/A54/A56) require integration/fault tests with actual transactions; synthetic pure-function tests alone are insufficient. Localization/accessibility journeys cover all participant and admin modules. None of these targets is recorded as passed merely because its specification exists.
