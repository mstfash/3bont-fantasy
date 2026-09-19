# Discovery interview

Status: historical interview, baseline completed on 2026-09-18. Direct user answers through Q16 are retained below. The user's subsequent instruction to select recommended options authorizes the remaining design decisions in [delegated-decisions.md](delegated-decisions.md). Older “open” notes describe the state at that answer, not current unresolved preferences.

## Round 1 — Product boundaries (Q01, Q02, Q02a and Q03 resolved)

**Q01 — Operator model.** Is the first release for one 3bont/client operator with configurable competitions, or several independent customer organizations? Scenario: two customers launch games using the same Egyptian match. Can either admin see the other's participants, prices, configuration or data corrections? Recommendation: one operator unless independent customers are an actual launch requirement.

**Q02 — Meaning of price.** Is a footballer's fantasy selection price controlled by game rules/admin, tied directly to real market valuation, or are both separate launch features? Scenario: a valuation changes overnight; should an existing squad's budget, selling price or eligibility change? Recommendation: separate fantasy price from real valuation.

**Q02a — Valuation influence.** With both features required at launch, should market valuations inform suggested initial fantasy prices, remain informational only, or drive ongoing repricing? Recommendation: use valuations as one input for suggested initial prices, then publish explicit fantasy prices; a later valuation change should not silently change game economics. Automatic repricing and selling-price rules still need their own decisions.

**Q03 — Launch modules.** Are H2H, prizes, achievements, chat, sponsors, both languages and native apps all required at launch? Choices presented: core fantasy + both languages then prioritize additions; all including native; all except native. An answer on grouping is followed by explicit per-module definition. No answer means unresolved, not agreement.

## Round 2 — Competition language and participation

- Q04: Can two fantasy competitions use the same real season with different scoring? Can one game use several real competitions?
- Q05: Does “league” mean the Egyptian football competition, a fantasy competition, or a participant ranking group? Agree canonical terms.
- Q06: One squad per person per fantasy competition, or multiple entries? Late joins and deleted accounts?
- Q07: Target Egyptian season and phase/group/playoff format? How are postponed fixtures assigned to scoring rounds?
- Q08: Exact squad size, positions, formation constraints, club caps, starting budget and reserve rules? Give one valid and three invalid squads.

## Round 3 — Rules and time

- Q09: One round deadline or per-fixture locks? What wins if a transfer begins before and commits after the deadline?
- Q10: Captain/vice behavior, zero minutes, auto-sub order, formation preservation, chips?
- Q11: Free transfer accrual, carryover cap, costs, price-rise selling rules, mid-season real club changes?
- Q12: Minimum scoring inputs and point values by position; minutes thresholds, clean sheets, own goals, cards, saves, assists and bonus sources?
- Q13: At 20:00 an admin changes an assist from 3 to 4 after a 19:00 match. Future rounds only, unlocked matches, or explicitly chosen historical results?
- Q14: A goal becomes an own goal two days later. Reopen a finalized round? Revise H2H wins, achievements, rankings and prizes already announced?
- Q15: Ties: shared rank, shared prize, ordered secondary rules? Rounding / fractional points?

## Round 4 — Data and operations

- Q16: Which official evidence resolves a dispute when provider and admin disagree? Should later provider updates overwrite an admin correction?
- Q17: Cairo 15:00–23:00 is a suggested window: at 23:10 a delayed match is still live. Continue within reserved quota or stop with stale status?
- Q18: Who owns the provider key; can other apps use it? What freshness degradation is acceptable when quota is low?
- Q19: Expected registered users, peak concurrent requests before a deadline, notification volume and growth?
- Q20: What downtime/data loss is acceptable, who handles incidents, and what action is possible without developer help?
- Q21: Is $100/month a target or an absolute spend cap? If absolute, which features can degrade first?
- Q22: Existing auth/branding/sponsor obligations or integrations? Supported login methods and admin permissions?

## Round 5 — Module contracts and delivery

- Q23: H2H schedule type, odd-member byes, late joins, abandoned rounds and ties?
- Q24: Prizes: display only, audited eligibility, fulfillment tracking, or actual payouts? Who approves final results?
- Q25: Chat: league rooms or direct messages, reporting, moderation and retention?
- Q26: Achievements: fixed catalogue or configurable conditions; reversal after corrections?
- Q27: Sponsors: content slots or ad targeting, campaigns and measurement?
- Q28: Native apps: iOS/Android, launch date, publishing accounts, offline/push expectations?
- Q29: Arabic/English: UI plus admin content plus names? Which language is default and who translates?
- Q30: Launch deadline, approved budget, change process, warranty, maintenance and operating-cost owner?

## Answer log

No next routine question is pending. Q16a–Q30 and remaining follow-ups are covered by D01–D15 under explicit delegation. Read the canonical specifications linked in [requirements.md](requirements.md) for current behavior. External evidence gates remain in [evidence-register.md](evidence-register.md).

### Q01 — Resolved, 2026-09-18

User selected: “One operator manages multiple competitions (Recommended).” The first release serves one operating organization with multiple fantasy competitions; independent customer organizations are outside this release's operating model. This does not limit the operator to one staff account or settle staff permissions.

Updated Operator in CONTEXT.md; recorded ADR-0005; added R33. Competition relationships, pricing and launch modules remain open.

Interview preference: ask one question at a time through the question tool, always with a recommendation and its reason. Keep the question active while awaiting the answer.

### Q02 — Resolved, 2026-09-18

User selected: “Both fantasy prices and separate real-world valuations at launch.” Both are required launch features; the earlier recommendation to defer market valuations was not selected. Added Fantasy Price and Market Valuation to CONTEXT.md and R34 to requirements. Source/provider, coverage, currency, freshness, missing-value behavior and valuation influence remain unresolved. Q02a addresses influence before detailed pricing rules.

### Q02a — Resolved, 2026-09-18

User selected: “Help suggest starting prices; later valuation changes don't automatically reprice the game (Recommended).” Valuations are one input to suggested starting fantasy prices, with admin review before publication. Later valuation updates do not automatically alter fantasy prices. The game's own ongoing repricing, selling-price rules, initial-price formula and missing-value behavior remain open. Recorded ADR-0006 and updated R34.

### Q03 — Resolved by correction, 2026-09-18

After initially selecting the smaller launch option, the user immediately corrected it: “no wait I choose second option.” The applicable tool's second option was “All named modules at launch except native apps.” Record that corrected choice as authoritative: core fantasy, both price features, Arabic/English, H2H, prizes, achievements, chat and sponsors ship in the first release; native iOS/Android apps are deferred. The recommendation to phase other modules after launch was not accepted. See release-scope.md; module details remain for Q23–Q29.

### Q04 — Resolved, 2026-09-18

User selected: “One real season per fantasy competition; multiple fantasy games can share it (Recommended).” Several fantasy competitions may share a real season and match data, while keeping separate squads, rules and standings. Combined real leagues/seasons within one fantasy competition are outside the launch model. Added Football Competition, Football Season and Fantasy Competition to CONTEXT.md; recorded ADR-0007 and R36. Participant league-group semantics are next (Q05).

### Q05 — Resolved, 2026-09-18

User selected: “Leagues reuse the competition's squad and player-scoring rules (Recommended).” Public/private League Groups reuse competition squads and points. H2H groups compare those points through matchups; different squad or player-scoring rules require a separate Fantasy Competition. Added League Group to CONTEXT.md, refined ADR-0007 and R25/R36. Entry limits, membership limits, invitations and H2H scheduling remain open.

### Q06 — Resolved, 2026-09-18

User answered: “i choose option 2 with options to make it option 1 or expand to go to option 2 as i need”. The squad-entry limit per participant account is configurable per Fantasy Competition, supporting a limit of one and higher limits. Do not hardcode a one-account/one-squad relationship. Changes to the limit after entries exist, per-League-Group entry eligibility, multi-entry prize treatment and multi-account enforcement remain open. A default limit of one is a recommendation, not yet an explicit product decision.

**Q06a — Lowering an entry limit.** If the current limit is three and accounts already have three squads, can an admin lower it to one? Recommendation: reject a new limit below any account's existing entry count; retain all entries and their history. Other options are grandfathering existing entries or a reviewed retirement workflow with defined score/prize effects.

### Q06a — Resolved, 2026-09-18

User selected: “Block reductions below an account's existing entry count (Recommended).” Reject a reduced cap if any participant account in the competition already has more entries than that cap. Preserve entries, scores and prize eligibility; this action never silently retires squads. Entry creation and cap updates must enforce this invariant under concurrency. Increasing the cap remains possible, subject to entry-window and eligibility rules still to be defined.

**Q06b — Late entries.** Can participants create new or additional squads after competition play begins? Recommendation: an admin-configurable entry window, with late entrants starting from zero and scoring from the next eligible unlocked gameweek; no historical points. Group/H2H/prize eligibility requires separate rules.

### Q06b — Resolved, 2026-09-18

User selected: “Admin-configurable window; late squads start at zero from the next unlocked gameweek (Recommended).” Apply the configured registration window to new participants and additional squads, including after an entry-cap increase. New entries start at zero, cannot receive historical points and are eligible from the next gameweek whose deadline remains open. Detailed deadline semantics, transfer allowances/chip inventories for late entrants, H2H admission and prize eligibility remain open.

### Q07 — Target established, 2026-09-18

User clarified the main Egyptian Premier League for season 26/27 and selected the no-committed-date approach if that was insufficient. Record target as Egyptian Premier League 2026/27, with no firm launch date. Validate provider coverage, replay completed fixtures and run a live rehearsal before scheduling launch. This is the user's target, not verification of provider season identifiers, live coverage, fixture dates or the competition's phase format; those remain POC work.

### Q08 — Default template resolved, 2026-09-18

User answered: “I choose 1 but the options to alter the configurtion of course”. Accepted configurable defaults: 15 footballers (2 GK, 5 DEF, 5 MID, 3 FWD), 11 starters and 4 reserves, 100 fantasy units of starting budget, maximum 3 footballers per club. Admin must be able to alter these values per competition. No decision yet on permitted formation shapes, price precision, or when/how changes affect existing squads. Recorded in game-rules.md and R22.

**Q08a — Formations.** Recommendation: admin-configurable permitted formations; default 11 starters with exactly 1 GK, 3–5 DEF, 2–5 MID and 1–3 FWD, with counts totaling 11. Configuration must remain compatible with the squad template.

### Q08a — Resolved, 2026-09-18

User selected: “Use these formation defaults, with admin configuration (Recommended).” Default 11 starters: 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD, totaling 11. Admin can configure permitted formations; incompatible squad/formation configurations must be rejected. Updated game-rules.md and R22.

### Q09 — Deadline mode resolved, 2026-09-18

User selected: “One gameweek deadline with an editable 90-minute default offset (Recommended).” Calculate the initial deadline from the first kickoff minus the configured offset. Lock squad/lineup snapshots for the whole gameweek; later edits affect the next gameweek. Per-fixture locking is not selected. Recorded ADR-0008. Exact cutoff/race semantics, rescheduled fixtures and permitted deadline edits remain open.

### Q09a — Resolved, 2026-09-18

User selected: “Server acceptance before the deadline; clearly reject late current-gameweek requests (Recommended).” A change must be validated and accepted by the server before the cutoff. Reject late requests explicitly targeting a locked gameweek, without silently applying them to another gameweek. Client clock/click time and delayed scheduling jobs confer no exception. Refined ADR-0008, R39 and A10.

### Q09b — Resolved, 2026-09-18

User selected: “Move to a future gameweek before its lock; use that future lineup (Recommended).” An unplayed fixture postponed beyond the original gameweek receives an audited admin assignment to an unlocked future gameweek and uses that destination's lineup. Matches delayed within the same gameweek stay there. Support blank/double gameweeks and avoid duplicate fixture contributions. Suspended/partially played fixtures, no eligible destination and exact phase mapping remain open.

### Q10 — Captaincy resolved, 2026-09-18

User selected: “Use these configurable captain/vice-captain defaults (Recommended).” Captain and vice are distinct starters. Captain's entire gameweek points receive a default 2× multiplier, including negative values. Vice receives it only if captain plays zero minutes across the whole gameweek and vice plays. Neither playing means no multiplier. Admin can enable/disable captaincy and configure the multiplier. Add Captain and Vice-Captain to CONTEXT.md; record behavior in game-rules.md and R24. Bench substitution and chips remain open.

### Q10a — Resolved, 2026-09-18

User selected: “Use these automatic-substitution defaults, configurable on/off (Recommended).” For confirmed zero minutes across the whole gameweek, replace a starter with a reserve who played. GK replaces GK only; outfield replacements follow saved bench order and preserve allowed formation. Any minutes prevent replacement, regardless of negative points. Captaincy follows Q10 independently. Deterministic multi-absence examples and correction handling require verification; chips remain open.

### Q10b — Resolved, 2026-09-18

User selected: “Build all four chip types with admin controls (Recommended).” Include Wildcard (unlimited no-deduction transfers with retained squad), Free Hit (temporary gameweek squad then restoration), Bench Boost (whole squad scores) and Triple Captain (total 3× replacing normal 2×). Admin controls enabled types, allowances and availability windows. Chip names are added to CONTEXT.md; detailed usage and transfer interactions remain open.

### Q10c — Resolved, 2026-09-18

User selected: “Independent inventory per squad; configurable allowances; one chip per gameweek (Recommended).” Each squad owns its inventory, default one use of each chip type per Fantasy Competition, with admin-configurable counts/windows. At most one chip per squad per gameweek; no stacking and no shared account-wide chip inventory. Activation/cancellation, late-entry grants and transfer-chip interactions remain open.

### Q11 — Ordinary transfer defaults resolved, 2026-09-18

User selected: “Use configurable defaults: 1 free transfer, carry up to 5, extra transfers cost 4 points (Recommended).” Each squad receives the configured allowance; unused transfers carry to the configured cap; extra transfers cost the configured points. Initial building is unlimited before the entry's first eligible deadline. Default allowance is one per gameweek, cap five, extra cost four. Add Fantasy Transfer and Free Transfer to CONTEXT.md. Accrual timing, late-entry balances, deduction assignment, chips and selling prices need further rules.

### Q11a — Resolved, 2026-09-18

User selected: “Half the gain rounded down to 0.1, full losses; configurable policy (Recommended).” Apply this default to Fantasy Price relative to each squad's Purchase Price, never to Market Valuation. Example: purchase 7.0/current 7.5/sell 7.2; purchase 7.0/current 6.8/sell 6.8. Admin chooses the selling-price policy; active-policy changes remain open. Added Purchase Price and Selling Price to CONTEXT.md, rulebook and R23.

### Q11b — Pricing strategy resolved, 2026-09-18

User selected: “Bounded performance-based updates between gameweeks (Recommended).” Use fantasy scoring results after completed gameweeks with configurable thresholds, min/max prices and manual overrides. Keep ongoing real valuations separate and exclude demand-driven repricing from the selected strategy. The exact formula must be documented and simulated; lookback, caps, finality/corrections, overlapping gameweeks and override precedence remain open. Refined ADR-0006 and game-rules.md.

### Q11c — Resolved, 2026-09-18

User selected: “Preserve saved transfers and grant the next normal allowance up to the cap (Recommended).” Wildcard/Free Hit-covered transfers do not consume saved free transfers; preserve the balance and grant the next regular allowance subject to the configured cap. Default examples: 3 → 4, 5 → 5. Earlier same-gameweek transfers before activation and cancellation effects remain open.

### Q11d — Resolved, 2026-09-18

User selected: “Restore the previous-deadline squad; all that gameweek's transfers are temporary (Recommended).” For established entries, restore the previous-deadline squad with bank and original purchase prices for editing the following gameweek. All transfers for the Free Hit gameweek, including those made before activation, are temporary with deductions and free-transfer use waived. Published player prices continue normally. Recorded ADR-0009; cancellation and first-entry chip availability remain open.

### Q11e — Resolved, 2026-09-18

User selected: “Allow cancellation before the deadline with the stated preview and restoration rules (Recommended).” Preview cancellation impact: scoring chips remove their effects; Wildcard keeps transfers with normal costs recalculated; Free Hit restores pre-activation squad and earlier normal costs. Return the unused chip. At the deadline the selected chip is consumed and cannot be cancelled by the participant. This deliberately distinguishes Free Hit cancellation from the previous-deadline restoration after use. Refined ADR-0009.

### Q12 — Basic scoring resolved, 2026-09-18

User selected: “Use this editable appearance/goals/assists template (Recommended).” Per fixture: zero minutes gives no appearance points, playing below 60 minutes gives one, at least 60 gives two; goals GK/DEF/MID/FWD = 10/6/5/4; assists = 3. All values and the minutes threshold are configurable. Clean sheets, conceded goals, saves, penalties, discipline and bonus rules remain open. Provider validation must demonstrate the required inputs rather than assume coverage.

### Q12a — Resolved, 2026-09-18

User selected: “Use these configurable clean-sheet/conceded-goal rules (Recommended).” Default clean-sheet awards GK/DEF 4, MID 1, FWD 0; minimum 60 minutes and no conceded goal while on the pitch. GK/DEF lose one point per two goals conceded while playing. Normal substitution stops subsequent goals affecting that player. All defaults are configurable; provider participation timeline must support the rule. Red-card exceptions are next.

### Q12b — Resolved, 2026-09-18

User selected: “Use these card deductions and sending-off defaults (Recommended).” Editable yellow −1 and straight red −3; second-yellow dismissal totals −3 replacing yellow deductions; independent straight red after a yellow totals −4. Sent-off players receive no clean-sheet award. GK/DEF continue accumulating conceded goals after dismissal. Requires reliable dismissal-type/event data and deduplication of paired provider events.

### Q12c — Resolved, 2026-09-18

User selected: “Use these configurable saves/penalties/own-goal defaults (Recommended).” Per fixture: GK saves +1 per 3, saved penalty +5 additionally (also part of save count), missed penalty −2, own goal −2. Shootouts excluded. Own goals still affect defensive calculations where applicable. Normalize provider aggregates/events to avoid duplicate save counts and validate required data coverage.

### Q12d — Resolved, 2026-09-18

User selected: “Support configurable bonus scoring, disabled by default pending formula/data validation (Recommended).” Include an optional configurable category, but no active default bonus formula. Validate precise formula, required data and tie semantics before enablement. Do not automatically equate provider ratings with bonus points. Active bonus scoring is not required for launch; category support remains in scope.

### Q13 — Resolved, 2026-09-18

User selected: “Future unlocked gameweeks by default; separate audited historical recalculation (Recommended).” Publish a new scoring version for future unlocked rounds; locked rounds retain their version. Historical changes require scoped admin recalculation with impact preview and audit, subject to pending finality/prize policy. Mark ADR-0003 accepted for versioning/replay, retaining unresolved finality/override details.

### Q13a — Resolved, 2026-09-18

User selected: “Edit structural rules in drafts/new competitions; freeze after first lock (Recommended).” Freeze squad size, position quotas, formations and starting budget after the competition's first gameweek lock. Drafts/new competitions remain configurable. No mid-season migration/repair workflow for these categories is selected. Entry-count caps remain adjustable under Q06/Q06a; club-cap and other rule categories require separate policy. Recorded ADR-0010.

### Q14 — Resolved, 2026-09-18

User selected: “Automatic finalization after the correction window; review late corrections (Recommended).” Results remain provisional until all assigned fixtures settle plus a configurable correction window initially 24 hours. Finalize automatically only when required data is complete and no issues remain. Later provider corrections create review cases; reopening must be audited. Added result-state terms and ADR-0011. Timer reset and downstream prize/achievement/H2H/pricing policies remain open.

### Q15 — Ranking ties resolved, 2026-09-18

User selected: “Shared ranks by default, with configurable documented tie-break policies (Recommended).” Overall/classic rankings use shared ranks by default (100, 100, 90 → 1, 1, 3). Admin may choose an explicit documented tie-break policy. Display ordering does not constitute a tie-break. Prize ties, H2H draws and the supported tie-break catalogue remain open.

### Q16 — Resolved, 2026-09-18

User selected: “Admin override persists until explicitly removed; retain provider evidence and flag conflicts (Recommended).” Recorded-reason/evidence corrections override disagreeing provider updates until explicitly removed by an authorized admin. Retain raw/source evidence and flag conflicts. Recalculation respects Q13/Q14 versioning and finality. Cross-competition correction scope is the next question.
