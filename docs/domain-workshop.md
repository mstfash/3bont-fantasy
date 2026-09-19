# Domain ownership and stress cases

The glossary in [CONTEXT.md](../CONTEXT.md) defines language. The current baseline uses one cohesive domain with explicit module owners, not a service per noun.

| Owner                      | Owns                                                                         | Consumers / boundary                                                    |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Football data              | Footballer/club/fixture identity, observations, effective facts, overrides   | Games reference fact revisions; never privately redefine who scored     |
| Competition administration | Season relationship, assignments, rules, availability                        | Entries/scoring consume effective immutable configuration               |
| Entries                    | Entry identity, permanent/temporary squad, bank, transfers, chips, snapshots | Scoring reads locked snapshots; groups reference entry ID               |
| Scoring                    | Fixture/player and entry net points, input trace                             | Publishes complete result revision                                      |
| Standings                  | Overall/classic rank and fixed H2H schedule/results                          | Awards consume versioned eligible outcomes                              |
| Awards                     | Achievement definitions/grants and prize pools/proposals/fulfillment         | Corrections can revoke derived achievements, not erase fulfilled prizes |
| Community                  | Membership-scoped chat and moderation                                        | Account identity, not duplicate entry identities                        |
| Sponsors                   | Campaigns, assets, placement/reporting                                       | No authority over facts, scoring or participant access                  |
| Operations                 | Quota, scheduling, job/recovery health                                       | Cannot bypass competitive invariants                                    |

## Decisive examples

1. One real assist scores 3 in game A and 4 in game B: shared fact, different rules.
2. An account owns 3 entries: each has independent budget/chips; a group's default one-entry limit is separate.
3. A late squad is eligible next round with zero history; it cannot recreate retired entries to replenish chips.
4. A club transfer causes an over-cap holding: retain score eligibility, require full repair at next transfer batch.
5. Free Hit cancelled before deadline restores pre-activation B; used through deadline restores previous permanent A. A later Free Hit never treats the earlier temporary squad as permanent.
6. A provider deletes a scored event: normalize replacement/deletion explicitly; identical hashes alone cannot express the change.
7. Shared factual correction affects two games, one finalized: update provisional game, create a review case for the finalized game.
8. Corrected final results change a prize winner after fulfillment: recompute standings and create a discrepancy case without silently reversing payment.
9. Restart after an old backup: its request counter may be behind actual provider usage; reconcile before outbound calls.
10. Historical standings and live club names differ: retain snapshot attribution and display dated/current identity deliberately.

See the [acceptance catalogue](acceptance-scenarios.md) for verification targets. Persistence schema and API contracts are implemented incrementally from these owners, not generated automatically from glossary nouns.
