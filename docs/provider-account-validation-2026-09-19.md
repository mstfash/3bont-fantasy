# API-Football account validation — 19 September 2026

## Result

The user-supplied direct API-Football key authenticated successfully. The account is active on Free, with 100 requests/day and 10/minute. A request for Egypt's 2026 season returned HTTP 200 with an entitlement error limiting this account to seasons 2022–2024. **This account cannot currently supply the requested 2026/27 game.** An upgrade would remove the advertised free-season limitation, but actual 2026 coverage, fixtures and fantasy-stat quality still need verification before purchase or launch. No subscription was purchased.

Three manually bounded discovery requests were made; no scheduler was enabled. The first status response reported zero usage and 100 remaining; the final response reported 98 remaining. Treat these as observations at the recorded times, not a permanent allowance or a guarantee that other account members are idle.

| UTC observation | Request                                  | Result                                                                |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| 12:20:13        | `GET /status`                            | Active Free; daily limit 100; minute limit 10; current usage 0        |
| 12:20:21        | `GET /leagues?country=Egypt&season=2026` | HTTP 200, `errors.plan`; no season data authorized                    |
| 12:20:36        | `GET /leagues?country=Egypt&season=2024` | Five Egyptian competitions; Premier League ID 233; daily remaining 98 |

The permitted Premier League record has season parameter 2024, dates 2024-10-30 through 2025-06-01, and flags for events, lineups, fixture/player statistics, players and standings. Injuries are flagged unavailable. These are catalogue claims for that historical season, not fixture-level validation or evidence about 2026.

Sanitized account/coverage evidence is retained in `artifacts/verification/provider-discovery-2026-09-19.json`. Private diagnostic responses and exclusive pre-send reservation files live under ignored `.local/provider-validation/`. Account identity and credential-bearing headers were not retained in the sanitized artifact. The key is stored only in ignored `.env.local`, mode 0600, as `API_FOOTBALL_KEY`; automation remains false. No football facts, valuations or public synthetic seasons were replaced.

## Integration and request budget

The existing worker gateway already uses the direct HTTPS origin and `x-apisports-key`, rejects redirects, bounds response sizes/timeouts, charges attempts before dispatch, and retains redacted evidence. The application reads its database; page views never spend provider quota. See [gateway design](provider-gateway-design.md) and [collection plan](provider-scheduling-plan.md).

These three initial account-discovery probes ran before an application provider account existed, with automation disabled and one exclusive reservation per request. They are external usage for the application's future reconciliation. Before any gateway activation, reconcile against fresh account usage, conservatively including uncertain requests; do not initialize the ledger to zero. No application provider account or season schedule was created. All routine diagnostics, pages and retries after setup must use the durable gateway.

For the direct dashboard subscription, the provider's [terms](https://www.api-football.com/terms) specify a 00:00 UTC daily reset; their RapidAPI section describes different timing. Configure the direct reset boundary and verify it operationally. Cairo local midnight is not the boundary. Account/team-member traffic shares allowance, so dedicated account usage must be established before automatic collection.

Recommended free-account development budget: at most 20 ordinary research requests/day, 10 held for corrections/recovery, and 70 left unused or for separately reviewed work. This is an operating plan, not a new enforced application setting. Existing gateway enforcement protects 10% of the verified daily ceiling; it would allow up to 90 ordinary calls on a fresh 100-call day. Keep automation off while the target season is inaccessible.

Current collection costs four requests per fixture per batch. At 15-minute intervals, an eight-hour window is approximately 32 batches or 128 calls **for one fixture**, before retries and other games. That cannot fit this free plan. Even a restrained four-call post-match bundle and four-call next-day correction bundle cost eight calls per fixture. Bootstrap player pagination and metadata add more. Never promise live fantasy scoring from this allowance.

## Next execution steps

1. Use a separately identified historical season for replay. Start with one completed fixture's four-resource bundle, then evaluate participation timelines, discipline and missing fields before expanding the sample. Schedule the work under an explicit daily allocation.
2. Before requesting current data, choose an account entitled to it. The [pricing page](https://www.api-football.com/pricing) currently advertises Pro at $19/month with 7,500 calls/day. This is a candidate, not a purchase or a proved capacity fit.
3. Resolve Egypt/2026 coverage and real fixture IDs again with that account. Map real clubs/players explicitly; never convert the seeded synthetic season by relabeling it.
4. Validate retained match bundles through the existing reviewed normalization workflow. Defensive-event normalization and automatic report acceptance remain unfinished; collection alone does not produce trustworthy fantasy points.
5. Forecast calls from the actual fixture calendar, measure correction timing, reconcile usage, and enable only a cadence that fits. Preserve reserve capacity and display the last successful refresh.
6. Complete independent [market-value sourcing](market-valuation-sourcing.md). Fantasy pricing continues to use its own reviewed rules.

## Verification

Application type checking and lint passed. All 74 application PostgreSQL integration tests passed, including the new denial case; synthetic transports consumed no provider quota. A scan of Git-visible files found zero copies of the supplied credential. These checks cover this validation change; previous full browser/container results remain recorded in the slice 32 proof.

A controlled PostgreSQL regression case reproduces an HTTP 200 season-entitlement error, verifies that it remains a charged `provider-error`, preserves the explanation as evidence, and blocks an immediate retry without a second transport call. It does not consume live quota. Existing backoff can eventually retry; it does not itself permanently disable an unsupported season, which is why no such schedule was enabled.

The supplied GitHub repository is configured as local `origin`. A read-only remote-ref check returned no refs. No push was performed in this validation step.
