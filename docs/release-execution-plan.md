# Release execution plan

The user's six priorities are the working order. A passing local suite is evidence for implemented behavior, not a declaration that every release gate is complete.

| Workstream              | Current position                                                                                                                         | Required exit evidence                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git and CI              | Checkpoint pushed; protection enforced; protected PR merges with remote checks required                                                  | Green GitHub Actions gate on the merged main commit; documented local reproduction                                                                                                                                         |
| Match processing        | Reviewed ordinary FT timelines and regression fixtures implemented in slice 33                                                           | Licensed source samples resolve provider-specific null/card/penalty conventions; versioned worker acceptance, idempotency and complete historical eligibility before automation                                            |
| Corrections             | Shared-fixture review, overall/classic/H2H/prize projections and bounded historical rules replay implemented (slices 36–37)              | Exceptional fixture handling and evidence-backed participant snapshot repair                                                                                                                                               |
| Real data and prices    | Free key validated; one historical bundle held for roster/VAR discrepancies; target season blocked; licensed valuation supply unverified | 2026/27 entitlement and actual fixture coverage; historical/live sample replay; sourced valuation imports; approved affordability/drift calibration                                                                        |
| Deployment and recovery | Local PostgreSQL and Linux container proof exist                                                                                         | Named isolated staging host/domain; verified sender; monitoring/alert destination; off-host backup restore into a clean database; deadline load and interrupted-worker rehearsal; retention/exceptional privacy procedures |
| Competition rehearsal   | Synthetic replay and bilingual participant/admin E2E exist                                                                               | One dated rehearsal through registrations, multiple entries, transfers/chips, lock races, postponements, corrections, finalization and two-person prize approval, then Arabic/English mobile acceptance                    |

## Remaining external inputs

- Current-season provider entitlement. Free access explicitly rejects 2026; do not silently relabel historical data. Establish dedicated account usage and reconcile quota before enabling the worker.
- Licensed Egyptian player valuations with original valuation dates, currencies and permitted display/cache use. Transfer fees are not replacements.
- A staging destination and domain under the operator's control, verified email sender, alert recipients and off-host backup storage. Avoid applying this project to an unrelated production service merely because a host is accessible.
- The operator's retention, support and prize terms, and client acceptance of the rehearsal. Existing implementation defaults are not an executed commercial agreement.

## Correction implementation sequence

1. Classic/H2H projections reuse canonical published calculations (slice 34). Hypothetical awards now reuse prize eligibility/allocation with explicit financial read permissions and immutable recorded decisions (slice 35).
2. Implemented in slice 36: resolve every assignment before a rollback-only global match preview, redact restricted competition summaries and bind all affected dependencies.
3. Implemented in slice 36: reviewed confirmation includes source facts, overrides, locked lineups, rules versions, group membership/H2H editions and prize decision revisions. Assignment and material dependency changes invalidate the preview.
4. Publish through the existing transactional result workflow. Delivered prizes create review cases; history and fulfillment receipts are preserved.
5. Implemented in slice 37: owner-authorized bounded historical rules replay reuses canonical projections and atomically publishes rules and results. Ordinary future-rule editing and recorded participant decisions remain unchanged.
6. Next: exceptional fixture dispositions/settlement and evidence-backed historical participant snapshot repair.

## Evidence discipline

Record commit/image IDs, test scope and actual failures. Synthetic cases can prove software behavior but cannot prove provider coverage, valuation rights or production capacity. Do not enable automatic facts, buy services, silently change season scope or declare launch readiness to make a checklist appear complete.
