# Football provider validation plan

Status: initial account discovery completed; the durable gateway, identity bindings and protected source review are implemented in [slice 15](implementation-slice-15.md), [slice 23](implementation-slice-23.md) and [slice 25](implementation-slice-25.md). The user supplied a key on 2026-09-19. Three bounded requests verified Free limits and a 2026-season entitlement rejection; the permitted 2024 catalogue identified Premier League ID 233. See [account validation](provider-account-validation-2026-09-19.md). No paid calls or automatic collection; target-season coverage and fantasy-stat reliability remain unverified.

Target supplied by the user in Q07: Egyptian Premier League 2026/27. Resolve the provider's exact league and season identifiers and validate this edition's phase/fixture coverage. Do not assume the display label 2026/27 equals a provider's season parameter. Use completed fixtures for replay and a live rehearsal before setting a launch date.

Q02 makes separate real-world market valuations a launch requirement. The POC must now establish a usable valuation source, Egyptian footballer coverage, currencies, observation dates, allowed product use, update cadence and missing-value behavior. Do not substitute transfer fees for valuations or silently drop this feature if the match-data provider lacks it. Report any additional cost against the operating budget.

Q12a requires player participation intervals and goal ordering to attribute clean sheets/conceded goals before or after substitutions. Aggregate full-match team scores alone do not prove this rule is supported. Validate timestamps/order, stoppage-time representation, substitutions and incomplete events against actual target-season samples; report gaps rather than silently using a different rule.

Q12b requires distinguishing a second-yellow dismissal from a straight red after an earlier yellow, handling paired/duplicate dismissal events and tracking conceded goals after a sending-off. Aggregate yellow/red counts may be insufficient; capture event-level evidence and correction examples.

## Provider selection gate

Begin with API-Football because the user named it. Compare an alternative only if coverage, rights, freshness or quotas fail. Do not assume a transfer endpoint supplies real market valuations. Public marketing availability does not prove per-player statistics for this season.

On 2026-09-18 the [official site](https://www.api-football.com/) advertised Free at 100 requests/day and Pro at $19/month with 7,500 requests/day; free-season availability is limited. These are planning references, not a purchased plan or contractual guarantee. Verify in the actual account before using them as limits.

## Evidence matrix

For each sample, retain redacted payload, endpoint/parameters, observed timestamp, provider IDs, required fields present/missing, manual reference, discrepancy, and final assessment. Never store API keys or complete credential-bearing headers.

| Capability                   | Sample / edge case                                              | Pass condition                                                     |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Competition/season discovery | Exact Egyptian season and phases                                | Correct IDs, fixture population and coverage flags                 |
| Identity                     | Same-name players, club changes                                 | Stable provider identity and explicit mappings                     |
| Fixtures                     | Delay, postponement, abandonment, reschedule                    | Status/time revisions are representable                            |
| Participation                | Starter, unused bench, substitute, 59/60-minute boundary        | Minutes/start/substitution information adequate for selected rules |
| Scoring events               | Goal corrected to own goal, assist correction, penalty miss     | Inputs sufficient and corrections observable                       |
| Defensive stats              | Clean sheet, saves, penalties saved                             | Required coverage and attribution proven                           |
| Discipline                   | Second yellow/red, later correction                             | Unambiguous selected-rule interpretation                           |
| Lineups                      | Late lineup change                                              | Revision observed, no premature permanent polling stop             |
| Transfers / prices           | Club move and selected pricing inputs                           | Actual field availability; valuation is independently validated    |
| Latency                      | Several kickoff windows, final whistle and next-day corrections | Measured distribution against agreed freshness                     |
| Quota                        | All pages/endpoints/retries, headers, reset timezone            | Conservative ledger reconciles with provider account               |
| Rights                       | Data display, caching, logos/photos and redistribution          | Allowed use documented for intended product                        |

Proposed initial sample: 10 completed fixtures across multiple clubs, at least two live windows, plus recorded or synthetic edge cases not present in those samples. Broaden sampling if disagreement remains; no sample count proves perfect coverage.

## Request forecast

For each endpoint: calls = active polling cycles × request fanout × pagination × attempts. Add pre-match, post-match, next-day correction, baseline sync and bootstrap calls. Aggregate all competitions and jobs sharing a key; daily and minute ceilings both matter.

Example only: 8 hours at 60-second intervals is 480 poll cycles. One shared endpoint means 480 calls; three per-fixture endpoints over four simultaneous fixtures means 5,760 calls before retries or other jobs. Batching and endpoint coverage must be verified, not assumed.

Reserve headroom for retries, delayed finishes, reschedules and repairs. Separate initial import/backfill budgets from ordinary live polling. Stop lower-priority work first; hard stop provider calls when no safe reservation is available.

## Scheduler / gateway validation

- Fixture-aware schedule, with low-frequency discovery outside the proposed active window.
- Configured timezone and real provider reset boundary; Cairo daylight saving behavior tested.
- Delayed live matches do not disappear at 23:00 without the agreed policy.
- Canonical hashes retain scoring-relevant minute/status changes and detect removals.
- Single-flight deduplication across processes; TTLs depend on state.
- Request reservation is shared and durable; failed quota storage causes no request.
- Count potentially sent timed-out requests; no blind refund on uncertainty.
- Backoff and retry limits stay inside both daily and minute budgets.
- Shared API-key usage is explicitly modeled; observed headers cannot safely increase a quota on stale evidence.
- No provider API key reaches clients or logs.

## Reuse spike

Initial public README screening and the selected custom-domain direction are in [the evidence register](evidence-register.md). Before importing external engine code, verify license/commercial use, upstream provenance, provider independence, Egyptian season support, configurable rules, lock/replay/idempotency behavior, integration cost, tests and update ownership. README screening is not a source audit or proof of correctness. Do not promise a bug-free turnkey engine.

The next implementation contract is in [provider normalization](provider-normalization-plan.md). In particular, the appeared-player endpoint alone cannot establish historical eligibility or zero-minute nonappearance.
