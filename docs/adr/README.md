# Decision register

Accepted decisions reflect either direct user answers (Q/S references) or the user's delegated decision instruction (D references). Accepted means selected design, not implemented or experimentally proven. [Delegated decisions](../delegated-decisions.md) preserve that distinction.

| ADR                                                            | Decision                                                      | Basis                    |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| [0001](0001-typed-pnpm-turborepo.md)                           | Strict pnpm/Turborepo monorepo                                | S00                      |
| [0002](0002-central-provider-ingestion.md)                     | Durable budgeted provider gateway                             | D02                      |
| [0003](0003-versioned-rules-and-replay.md)                     | Versioned rules and reproducible replay                       | Q13                      |
| [0004](0004-modular-vps-application.md)                        | Modular web/worker, PostgreSQL-backed jobs                    | D04                      |
| [0005](0005-single-operator-multiple-competitions.md)          | One operator, multiple games                                  | Q01                      |
| [0006](0006-market-valuations-and-fantasy-prices.md)           | Separate valuation and fantasy-price lifecycles               | Q02/Q02a/Q11             |
| [0007](0007-shared-season-independent-fantasy-competitions.md) | Shared real seasons, independent games and subordinate groups | Q04/Q05                  |
| [0008](0008-single-gameweek-lock.md)                           | One strict deadline and postponed-fixture reassignment        | Q09/Q09a/Q09b            |
| [0009](0009-free-hit-temporary-squad.md)                       | Distinct Free Hit cancellation/restoration baselines          | Q11d/Q11e                |
| [0010](0010-freeze-structural-squad-rules.md)                  | Freeze structural rules after first lock                      | Q13a                     |
| [0011](0011-provisional-and-finalized-results.md)              | Correction window and audited reopening                       | Q14                      |
| [0012](0012-shared-facts-independent-finality.md)              | Shared factual corrections, independent finality              | D01/D13                  |
| [0013](0013-revision-bound-awards.md)                          | Revision-bound approval and separate fulfillment              | D06                      |
| [0014](0014-versioned-http-contracts.md)                       | Stable client contracts without another service               | D04/D09                  |
| [0015](0015-typed-sql-with-kysely.md)                          | Typed SQL with strict declaration compatibility               | Delegated implementation |

| [0016](0016-fixture-participation-evidence.md) | Historical fixture eligibility and explicit non-appearance evidence | Delegated implementation |

All records currently accepted. Routine defaults are in canonical specifications, not separate ADRs. Outstanding external checks are in the [evidence register](../evidence-register.md).

[0017 — H2H frozen schedule and withdrawal](0017-h2h-frozen-schedule-and-withdrawal.md) records the deadline boundary for withdrawal and immutable pairing policy (delegated implementation).

- [0018 — Equal future chip grants](0018-future-chip-grants.md)
- [0019 — Prize eligibility and fulfillment](0019-prize-eligibility-and-fulfillment.md)
- [0020 — Achievement corrections](0020-achievement-corrections.md)
- [0021 — Room membership and evidence](0021-room-membership-and-evidence.md)
- [0022 — Sponsor reporting without profiles](0022-sponsor-reporting-without-profiles.md)
- [0023 — Entry retirement boundary](0023-entry-retirement-boundary.md)
- [0024 — Preserve fulfilled awards during corrections](0024-preserve-fulfilled-awards-during-corrections.md)

- [0025 — Atomic reviewed catalogue imports](0025-atomic-reviewed-catalogue-imports.md)
- [0026 — Reviewed initial price evidence](0026-reviewed-initial-price-evidence.md)
- [0027 — Private account archives](0027-private-account-archives.md)
- [0028 — Consensual group handover](0028-consensual-group-handover.md)
- [0029 — Account closure and history](0029-account-closure-and-history.md)
- [0030 — Evidence-backed provider identities](0030-evidenced-provider-identities.md)

- [0031 — Bounded historical scoring corrections](0031-bounded-historical-scoring-corrections.md)

- [0032 - Evidenced exceptional fixture settlement](0032-evidenced-exceptional-fixture-settlement.md)

[0033 — Restore snapshots from accepted decisions](0033-restore-snapshots-from-accepted-decisions.md)

[0034 — Governed provider report acceptance](0034-governed-provider-report-acceptance.md)
