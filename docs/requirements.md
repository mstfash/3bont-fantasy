# Requirements inventory

Current consolidated baseline, 2026-09-18. **Q** = direct interview decision; **D** = agent recommendation selected under the user's explicit delegation; **S** = original source. The [historical interview](discovery.md) retains decision evolution, while linked specifications are current. Accepted design is not completed implementation.

| ID  | Requirement                                                 | Basis                | Specification / evidence                                             |
| --- | ----------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| R01 | Egyptian Premier League 2026/27 fantasy game                | S01, Q07             | No fixed launch date; E01 season/phase evidence                      |
| R02 | Automated ingestion, scoring and rankings                   | S01, D02/D13         | Architecture, result lifecycle; replay/live rehearsal                |
| R03 | Prices, spending and footballer rankings                    | S01, Q02/Q11         | Pricing policy; unmultiplied player rankings                         |
| R04 | Accurate sourced football data                              | S01, Q16             | Provider validation; persistent overrides, no unselected scraping    |
| R05 | Evaluate open-source foundation                             | S01, D15             | Evidence register candidate screening and bounded audit              |
| R06 | VPS deployment                                              | S02/S04, D04         | Operations and ADR-0004                                              |
| R07 | API-Football candidate                                      | S02/S04              | E01/E03; not yet a verified provider                                 |
| R08 | Fixture-aware Cairo schedule                                | S03, D02             | Operations; continue overruns within quota                           |
| R09 | Never exceed controlled-key request allowance               | S03, D02             | ADR-0002; durable reservations and fail-closed recovery              |
| R10 | Cache/change detection                                      | S03, D02             | Local reads; hashes save processing, not completed API calls         |
| R11 | Approximately $100/month target                             | S04, D03             | Cost ledger and measured capacity; not a guarantee                   |
| R12 | Historical $10k development discussion                      | S04                  | E07, no accepted fixed-price contract                                |
| R13 | Admin configuration without code for supported capabilities | S05/S06, D12         | Configuration lifecycle; no arbitrary rule code                      |
| R14 | H2H at launch                                               | Q03, D05             | Module specifications: editions, byes, late joining, corrections     |
| R15 | Prizes at launch                                            | Q03, D06             | Published rules, approval and fulfillment; no automated payment rail |
| R16 | Native apps deferred                                        | Corrected Q03, D09   | Versioned contracts; responsive web first                            |
| R17 | Achievements at launch                                      | Q03, D08             | Built-in configurable conditions, grants/revocations                 |
| R18 | User chat at launch                                         | Q03, D07             | Group rooms, moderation, retention and account access                |
| R19 | Arabic and English at launch                                | Q03, D09             | Arabic default, RTL/LTR, admin/content/email                         |
| R20 | Sponsors at launch                                          | Q03, D08             | Campaigns, slots, assets, aggregate reporting                        |
| R21 | Configurable scoring algorithm                              | Q12/Q13, D12         | Versioned bounded categories, preview, historical replay             |
| R22 | Configurable squad/budget/formation/club cap                | Q08/Q08a/Q13a, D12   | Game rules; structural freeze and valid draft changes                |
| R23 | Transfers, allowance, hits and selling prices               | Q11–Q11e, D11/D14    | Game rules and pricing; exact ledgers                                |
| R24 | Captain/vice, substitutions and all four chips              | Q10–Q10c/Q11c–e, D11 | Game rules; independent entry inventory and snapshots                |
| R25 | Public/private groups and rankings                          | Q05/Q15, D05         | Reused net points, group caps and explicit ties                      |
| R26 | Corrections and admin recalculation                         | Q13/Q14/Q16, D01/D13 | Result lifecycle; coherent revisions and award holds                 |
| R27 | Storage/queue/deployment stack                              | D04                  | PostgreSQL, pg-boss, modular VPS; Redis not required                 |
| R28 | Competition hierarchy                                       | Q01/Q04/Q05          | One operator; shared real season; independent games/groups           |
| R29 | Fully typed pnpm/Turborepo                                  | S00                  | Pinned strict toolchain; runtime validation at boundaries            |
| R30 | Plans, glossary, ADRs and discovery                         | S00, delegation      | Canonical docs and historical evidence separated                     |
| R31 | Resend transactional email                                  | S04, D04             | Auth/email adapter; E08 domain and volume verification               |
| R32 | AI-assisted development                                     | S02                  | Development context; no implied AI product feature                   |
| R33 | One operator, multiple competitions                         | Q01                  | ADR-0005; scoped staff permissions in modules                        |
| R34 | Both price concepts required at launch                      | Q02/Q02a/Q11a/b, D14 | Separate lifecycles; E02 valuation source mandatory                  |
| R35 | All named launch modules except native apps                 | Corrected Q03        | Release scope; detail in module specifications                       |
| R36 | One real season per fantasy competition                     | Q04/Q05              | ADR-0007, shared facts / independent results                         |
| R37 | Configurable per-account entry cap                          | Q06/Q06a, D10        | Atomic admission/cap reduction, preserved activated history          |
| R38 | Registration window and late entry                          | Q06b, D10/D11        | Next unlocked round, zero history, explicit first resources          |
| R39 | One authoritative gameweek cutoff                           | Q09/Q09a             | ADR-0008; atomic pre-cutoff server acceptance                        |
| R40 | Postponed and exceptional fixtures                          | Q09b, D13            | Result lifecycle; future lineup for unplayed reassignment            |
| R41 | Complete configurable fixture scoring                       | Q12–Q12d             | Game rules; bonus disabled until validated                           |
| R42 | Provisional/finalized result states                         | Q14, D13             | Timer reset, issues, review and downstream reconciliation            |

## Canonical specifications

- [Game rules](game-rules.md): entry, squad, transfers, chips and scoring defaults.
- [Pricing](pricing-policy.md): valuation provenance, exact sale accounting and calibration candidate.
- [Configuration policy](configuration-policy.md): editable/frozen categories and activation.
- [Result lifecycle](result-lifecycle.md): fixture settlement, correction and downstream publication.
- [Module contracts](module-specifications.md): group/H2H, prizes, achievements, chat, sponsors, accounts and localization.
- [Architecture](architecture.md) / [operations](operations.md): ownership, persistence, typed boundaries and operating targets.
- [Acceptance catalogue](acceptance-scenarios.md): scenarios to implement, not tests already passed.
- [Evidence register](evidence-register.md): external unknowns that selecting a recommendation cannot resolve.
