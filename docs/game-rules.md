# Game rules

Canonical gameplay specification. Q references are direct user decisions; D references come from [delegated decisions](delegated-decisions.md). Numbers are editable defaults with the lifecycle in [configuration policy](configuration-policy.md). Formula detail belongs in [pricing](pricing-policy.md); settlement belongs in [result lifecycle](result-lifecycle.md).

## Participation and ownership

One Operator manages multiple Fantasy Competitions. Each competition uses exactly one Football Season; several competitions can share football facts but retain independent rules, prices, entries and standings (Q01/Q04). League Groups compare existing competition entries and their points (Q05).

A Participant Account owns zero or more Fantasy Entries per competition. Each entry owns one permanent Fantasy Squad, bank, transfer ledger, chip inventory and gameweek snapshots. Free Hit adds temporary state to that entry; it does not create another entry.

The competition entry cap defaults to one and supports larger configured values (Q06, D10). Reject a cap reduction below any account's existing entry count (Q06a); creation and cap changes serialize against the same invariant. Draft entries count while retained; activated and retired entries count for the whole edition, preventing deletion/recreation to reset resources. An unactivated draft may be discarded without history or awards. Account closure pseudonymizes retained competitive records according to the published retention policy, never reallocates its history to a new account.

Registration has an admin-configured window (Q06b). An entry starts at zero from the next unlocked gameweek; no historical points or resource accrual. Increasing the cap does not reopen registration. A valid initial squad must be confirmed before its first eligible deadline; an incomplete draft remains ineligible and can target the next open round. Existing eligible entries automatically carry their last permanent valid lineup forward if no edit is made.

## Squad and formation defaults

| Setting                      | Default                                               |
| ---------------------------- | ----------------------------------------------------- |
| Squad                        | 15 distinct footballers: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Starting lineup / reserves   | 11 / 4                                                |
| Starting budget              | 100 fantasy units                                     |
| Club cap                     | 3 footballers per club                                |
| Permitted starting formation | Exactly 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD, totaling 11  |

Q08/Q08a allow configuration; reject incompatible counts, impossible formations, duplicate footballers, overspending and invalid captain/reserve selections. Store fantasy money in integer tenths; default budget is 1000 ticks. Points default to whole points; configured fractional values use integer thousandths (at most three decimal places), never binary floating-point accumulation. This D14 implementation refinement keeps point amounts distinct from fantasy-money ticks.

Fantasy position is a competition player-pool classification fixed after the first lock (D12), distinct from a provider's later position label. Newly introduced footballers receive an explicit position before selection. A real club transfer updates current affiliation for future validation, but not historical snapshots. Existing holdings that now exceed a club cap remain score-eligible; the next participant transfer batch must restore full compliance. Preview the necessary repairs; never force a sale or charge automatic hits.

## Deadlines and editing

One deadline per gameweek defaults to its earliest fixture kickoff minus 90 minutes (Q09). Publish its exact instant; store UTC and display Africa/Cairo or the user's selected timezone. Changes before lock require an audited revision and notice. A fixture-time feed update never silently moves an already published deadline. An elapsed deadline cannot be reopened by an ordinary edit.

Validation and authoritative server acceptance must occur strictly before the deadline (Q09a). A late request explicitly targeting that gameweek is rejected; never silently retarget it. Accepted commands, lineup, prices, rules and chip state are attributable. A delayed lock worker does not extend eligibility.

After lock, editing targets the next unlocked gameweek even while previous fixtures remain live. At most one forthcoming gameweek is editable per entry, keeping free-transfer accounting and temporary-squad restoration unambiguous. The next editing round opens after the previous lock transition, not after its final scores.

## Transfers and resources

Default allowance: 1 free transfer per gameweek, bank cap 5, extra transfer cost 4 points (Q11). Initial squad building is unlimited before the entry's first eligible lock; no free-transfer balance accrues for missed historical rounds. At the next editing-round opening, grant its first ordinary allowance. Every later round opening grants the configured allowance once, capped; existing unused balance remains.

Each confirmed outgoing/incoming pair counts as one transfer. Reversing A → B with B → A counts again, using actual sale/purchase prices. A batch validates the final whole squad atomically and charges all pairs; no intermediate invalid formation escapes. Point deductions belong to the targeted gameweek and apply to its net score used by overall, classic and H2H results.

With opening balance b, normal transfer count n, allowance a for the following round and cap c: used = min(b,n); hits = max(0,n-b) × cost; next opening balance = min(c,b-used+a). Wildcard/Free Hit set covered use and hits to zero, giving min(c,b+a), as Q11c specifies. Ledger transitions must be idempotent.

Each confirmation includes the expected entry and price revisions; a changed price or lineup requires a fresh preview. No silent repricing, partial transfer execution or budget compensation for market movement.

## Captaincy and automatic substitutions

Captain and distinct vice must be starting players. Captaincy defaults to enabled and 2× the selected player's gameweek points, including negatives (Q10). Vice receives the multiplier only if the captain has confirmed zero minutes across the entire gameweek and the vice plays; both absent means no multiplier. Unknown minutes never mean zero.

Auto-substitution defaults to enabled (Q10a). A starter with any minutes remains even with negative points. Reserve GK replaces only a zero-minute starter GK and must have played. Outfield replacements use the saved reserve order and permitted formations, considering all fixtures.

Deterministic algorithm (D11): enumerate valid assignments of played outfield reserves to zero-minute outfield starter slots. Unreplaced absent starters retain their positions for formation validation. Compare feasible assignments by a lexicographic inclusion vector in saved bench order, preferring inclusion of the earlier reserve, then the next. Break equivalent assignment ties by locked starter slot order. This avoids the result depending on which absent starter a loop visits first. With two absent defenders in a 3-defender lineup, an early midfielder cannot replace either if that leaves fewer than 3 defenders; a later played defender may replace one. With an absent defender and forward, a midfielder and defender can both enter if the final formation allows it.

Captaincy remains a separate calculation; the incoming substitute does not inherit a captain role. Bench Boost counts all owned players once, bypassing substitution selection, with the chosen captain/vice multiplier still applying once.

## Chips

All four types launch (Q10b). Inventory is independent per entry, default one use of each per competition; admins configure counts and windows (Q10c). One active chip per entry/gameweek, no stacking.

| Chip           | Effect                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wildcard       | All transfers for the targeted gameweek, including pre-activation ones, are free of hits/free-transfer consumption; keep resulting squad.                                                                           |
| Free Hit       | All transfers for that gameweek are temporary and free of hits/free-transfer consumption. Restore the previous-deadline permanent roster, bank and original purchase prices for the following editing round (Q11d). |
| Bench Boost    | All squad members contribute points for the gameweek.                                                                                                                                                               |
| Triple Captain | Total captain multiplier 3×, replacing normal 2×, not multiplying it by three. Vice fallback still applies.                                                                                                         |

Late entries receive the standard configured inventory for unexpired windows, without past grants (D11). Wildcard and Free Hit are unavailable before an entry's first lock: building is already unlimited and there is no previous-deadline baseline. Bench Boost/Triple Captain can be used at that first lock if otherwise eligible. Disallow enabling Triple Captain when captaincy is disabled.

Before the deadline, cancellation shows its full effect and returns inventory (Q11e): Bench Boost/Triple Captain remove the effect; Wildcard retains transfers and recalculates normal costs; Free Hit restores **pre-activation** state and earlier normal costs. After use, Free Hit instead restores the **previous-deadline** permanent state. Keep these two snapshots distinct. Restoration when the next editing round opens precedes new edits and cannot be applied a second time over them.

If configured inventory permits consecutive Free Hits, the previous-deadline permanent baseline remains the underlying permanent squad, never the earlier Free Hit's temporary scoring squad (D11). Preserve both records explicitly.

Consume the chip at lock. Late corrections do not return inventory. A blank gameweek still consumes a selected chip and applies transfer costs; display a warning before confirmation. Admins cannot silently grant selective refunds.

## Scoring template per fixture

| Event                            | Editable default                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Appearance                       | 0 for zero minutes; 1 for played below 60; 2 for at least 60                              |
| Goal GK / DEF / MID / FWD        | 10 / 6 / 5 / 4                                                                            |
| Assist                           | 3                                                                                         |
| Clean sheet GK / DEF / MID / FWD | 4 / 4 / 1 / 0, requiring 60 minutes and no conceded goal during participation             |
| Goals conceded, GK / DEF         | −1 per complete group of 2                                                                |
| Yellow / straight red            | −1 / −3                                                                                   |
| Second-yellow dismissal          | Total discipline −3 replacing the yellows; independent yellow then straight red totals −4 |
| GK saves                         | +1 per complete group of 3                                                                |
| Penalty saved                    | +5 additionally; the save also belongs in total saves                                     |
| Penalty missed / own goal        | −2 / −2                                                                                   |
| Bonus                            | Supported category, disabled by default pending validated formula/input/tie semantics     |

Q12–Q12d govern this table. Appearance tiers are alternatives. Two 30-minute appearances do not combine to meet the per-fixture 60-minute threshold. Exclude shootouts. Normalize paired dismissal events and saves to avoid double counting. Own goals also affect the appropriate defensive rules.

Normal substitutions end conceded-goal exposure; a later goal does not remove an earned clean sheet. Sent-off players get no clean-sheet award; GK/DEF remain liable for goals after dismissal through match end (Q12b). Ordered participation and goal evidence is required. Ambiguous ordering creates a review issue, not an invented outcome. Use the selected provider's documented assist attribution, with auditable factual correction when needed; do not implement an unstated “fantasy assist” convention.

Calculate footballer fixture points, then gameweek totals, then substitutions/chips/captaincy, then subtract entry transfer hits. Overall totals sum eligible net gameweeks. Player rankings show unmultiplied player points, never a participant's captain points. Classic/overall equal totals share ranks 1,1,3 (Q15). Supported optional secondary policy: fewer charged transfer points, then more total scored goals by effective scoring players (no captain multiplication), then shared rank. Publish the policy before competition start; display ordering never determines a winner.

## Changes and exceptions

[Configuration policy](configuration-policy.md) defines what can change and when. [Result lifecycle](result-lifecycle.md) defines postponement, suspended matches, correction windows, shared overrides and downstream effects. [Module specifications](module-specifications.md) define group limits, H2H and prize eligibility; they cannot silently change these base points.

## Entry retirement

Retirement is permanent for that entry and does not free its competition entry allowance. Server acceptance determines the boundary: deadlines already reached still use the last accepted squad, even if the deadline worker has not run yet. Later gameweeks receive no new snapshot; published H2H matches with future deadlines become forfeits, while locked matches and earned history stay intact.

Retirement does not automatically end group membership. The participant can still follow classic standings and conversation, and an organizer can continue managing the group; an explicit group departure follows the separate membership rules. Prize windows extending into gameweeks skipped after retirement exclude that entry without blocking other entrants. Awards covering only prior participating rounds remain subject to their original eligibility checks. The retirement review must disclose these consequences.

Retained unactivated drafts consume entry allowance until discarded. Only an unactivated draft without competitive history can be discarded; an activated or retired entry is preserved. Squad names can be changed by the owner without changing any selection, points or deadline snapshot.
