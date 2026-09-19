# Production readiness execution ledger

Updated 2026-09-19 against main `eca48fdd284b894cc16e9921fac406474403818b`. The required release includes all modules in release-scope.md; native apps remain deferred. Readiness means every required journey has working implementation and evidence, deployment/recovery has been rehearsed on the named environment, and the operator's external dependencies are available. It is not a zero-defect or uptime guarantee.

## Completion gates

| Gate                                    | Work and evidence required                                                                                                      | Current evidence / remaining work                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R01 Complete documented journeys        | Trace A01–A62 and every required module to implementation and executable coverage                                               | Core, groups, H2H, prizes, achievements, chat, sponsors, privacy and bilingual journeys exist; reconcile stale audit/delivery records and inspect edge cases |
| R02 Exceptional football outcomes       | Reviewed void/replay/awarded-result dispositions, retained partial evidence, safe resumption, deliberate empty-round settlement | Implemented with rollback-only review, official evidence and explicit zero-performance approval; full local regression/E2E passed (slice 38)                 |
| R03 Historical participant repair       | Original accepted-command evidence, owner-only exact preview, immutable repair history and atomic result publication            | Rules replay is complete; participant snapshot repair remains                                                                                                |
| R04 Provider acceptance                 | Versioned idempotent normalization/acceptance, strict ambiguity holds, budget and source freshness                              | Reviewed FT processing and quota collection tested; automated accepted reports and real target-season evidence remain                                        |
| R05 Real catalogue and prices           | Licensed season/player/valuation source, representative replay and approved calibration                                         | Free account rejects 2026; valuation licensing and real calibration remain external gates                                                                    |
| R06 Deployment package                  | Immutable releases, HTTPS proxy, secrets, migrations, startup/readiness, rollback                                               | Read-only Linux images and isolated container tests pass; target-host configuration and TLS/email remain                                                     |
| R07 Recovery and operational monitoring | Encrypted off-host base/WAL backups, restoration, provider/effect reconciliation, external alerts                               | Runbooks and in-app worker health exist; backup implementation and measured clean-environment recovery remain                                                |
| R08 Measured capacity                   | Documented dataset/load mix, cutoff contention, outage/worker interruption; no correctness failures                             | Small concurrency regressions pass; full operations.md workload on named hardware remains                                                                    |
| R09 Privacy and operating terms         | Retention schedule and purge proof, backup expiry, support/escalation and prize responsibilities                                | Product workflows exist; deployment retention and operator terms must be finalized                                                                           |
| R10 Final release rehearsal             | Registration to final awards across EN/AR mobile, corrected matches, rollback/recovery and current-head CI                      | Full synthetic E2E exists; one complete dated release rehearsal with deployment evidence remains                                                             |

## Execution order

1. Reconcile documentation against shipped source and tests; keep this ledger current without counting a document as implemented behavior.
2. Close R02 and R03 using canonical scoring, impact, authority and publication boundaries; add meaningful failure/concurrency/browser coverage.
3. Close R04 software behavior with synthetic and licensed captured fixtures; keep outbound automation disabled until E01/E03 pass.
4. Complete R06/R07/R09 deployable tooling and operational procedures, then exercise isolated recovery and R08 load; record measured limits rather than inventing capacity.
5. Obtain R05 and production configuration, run R10 on isolated staging, resolve failures and publish the verified release through protected CI.

## Required operator inputs

Requested through the question tool: intended host/domain, verified email service, off-host backup destination, and current-season provider entitlement. Do not paste credentials into chat or Git. Client-controlled accounts and isolated staging/production are the default recommendation. Paid purchases and unrelated production services are not assumed. Until these inputs exist, continue independent implementation and local rehearsal; external gates stay visibly open.

## Verified starting baseline

PR 12: 116 unit/harness cases, 121 PostgreSQL cases, 56 public smoke combinations, authenticated bilingual E2E, Linux containers and secret scans passed. That is bounded evidence for the shipped implementation, not evidence that R01–R10 are all complete. See artifacts/verification/historical-rules-proof.json and the protected CI run linked from PR 12.
