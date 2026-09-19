# Operating plan

D02/D03 select these engineering targets and controls. They are not measured capacity, paid services, an uptime SLA or a signed commercial agreement.

## Provider gateway and scheduling

Use one dedicated key per provider account/environment boundary; production keys are never shared with developer experiments or other applications. Only the worker gateway may use the key. All participants/admin screens read local storage; a refresh button requests budgeted work.

Reserve each potentially sent HTTP attempt before network I/O, atomically across workers. Count pagination, retry, bootstrap, diagnostic and admin calls. Enforce provider-confirmed daily/minute caps and reset boundaries with a conservative rolling minute limiter if semantics are uncertain. Unknown cap/reset or unavailable ledger stops outbound calls. A 429 or lower remaining-account observation may tighten limits; stale headers cannot restore budget.

Initially reserve 10% of daily allowance for post-match correction/recovery traffic; ordinary discovery/live work cannot spend that reserve. Both classes remain inside the total hard cap. Priority: required settlement/corrections, active fixtures, near-term lineups, schedule discovery, valuations/backfills/reports. Degrade cadence visibly when forecast exceeds budget. Queue expiry, bounded retries and exponential backoff prevent an outage from creating an unlimited recovery burst.

Cairo 15:00–23:00 is a planning hint, not a fixed cutoff. Discover schedule changes outside it (trial cadence every 6 hours, subject to quota), poll around actual fixtures and continue delayed live matches after 23:00 while safe reservations remain. Initial live freshness target is 120 seconds; derive feasible cadence from endpoint fanout/pagination and selected plan before enabling. Store UTC instants with Africa/Cairo scheduling; test daylight-saving transitions.

Freshness UI separates last provider success, last accepted fact and last published result. Missing data and quota exhaustion never become fabricated zero points. Same-payload hashes avoid redundant computation but do not refund requests. Quarantine schema-invalid responses with redacted evidence.

## Provisional performance targets

| Item                                 | Initial test target, selected by agent                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Dataset                              | 10,000 accounts, 20,000 entries, two games sharing a season, full historical rounds                 |
| Peak workload                        | 1,000 active browsers; mixed 100 reads/second plus 20 mutations/second for 15 minutes around cutoff |
| Chat component                       | Up to 200 visible rooms/users polling per second included in an additional peak profile             |
| Latency                              | p95 local reads ≤500ms and accepted mutation responses ≤1s, excluding client network                |
| Correctness                          | Zero accepted late mutations, duplicate spending, duplicate awards or budget overruns               |
| Ingestion to provisional publication | ≤120s target when provider inputs/quota are healthy                                                 |
| Backup recovery                      | RPO ≤15 minutes; RTO ≤4 hours, demonstrated by restore                                              |
| Availability                         | Report measured pilot availability; no contractual percentage yet                                   |

These are workload hypotheses, not customer demand. Load generation must state request mix, entry contention, cold caches, data size and hardware. If tests miss targets, profile queries/indexes/worker contention first, then revise host sizing and cost together. Never infer capacity from registered user count alone.

## Deployment and recovery

One VPS initially runs reverse proxy/TLS, web, worker and PostgreSQL through reproducible containers. Bound worker concurrency, connection pools and memory so ingestion cannot starve transfers. Pin release images/dependencies; isolate staging data and keys. Keep secrets outside Git, redact logs and verify backups do not expose credentials.

Use encrypted off-host database base backups plus continuous WAL archiving for point-in-time recovery, with 30-day retention as an initial policy and separate protected encryption keys. Monitor archive lag against RPO. Keep migration/restore runbooks and conduct a clean-host drill; a successful backup job is not restore evidence. PostgreSQL describes the mechanism in its [continuous archiving documentation](https://www.postgresql.org/docs/current/continuous-archiving.html).

After restoration, run `pnpm --filter @fantasy/worker provider:pause-after-restore` before any provider worker fetch. Keep external traffic paused until its quota ledger is reconciled conservatively with verified current provider usage. A backup may predate already-spent calls. Reconcile pending email/fulfillment effects and idempotency before restarting workers; do not replay real payments (no automated payment integration is selected).

Deploy compatible schema additions before app changes, migrate data, then remove old schema only after rollback window. Roll back code without deleting ledger/audit history. Health checks cover database, queue lag, provider budget/freshness, publication delay, disk, backup age and email failures. Initial alert channel is operator email plus admin dashboard; recipients are deployment configuration, not guessed contacts.

## Costs and ownership

Approximately $100/month remains a target. The historical $10k development discussion is not an accepted fixed-price quote. Before spending, obtain actual recurring prices and tax/renewal details for:

| Category                  | Required evidence                                               |
| ------------------------- | --------------------------------------------------------------- |
| VPS                       | Region, CPU/RAM/storage and measured workload on that shape     |
| Match data                | Target-season fields, rate limits and account tier              |
| Market valuations         | Separate license/source, coverage and refresh cost              |
| Resend                    | Verified domain, expected transactional volume and current plan |
| Backups/assets/monitoring | Stored volume, off-host retention, egress and alerting          |
| Domain/taxes/headroom     | Annualized domain fees, region taxes and contingency            |

Plan alerts at 70%, 85% and 95% of the configured monthly envelope. Disable optional analytics refresh/backfills before risking core storage, backups or deadlines. No automatic paid upgrades. Recommend client-owned production accounts with delegated operator access; this is an operating recommendation, not evidence of a contract.

## Incident actions

- Provider outage/quota exhaustion: stop unsafe calls, serve stale local data, hold settlement and show next retry.
- Bad football fact: quarantine or persistent evidenced override, preview affected games, obey each game's finality.
- Missed lock worker: use authoritative accepted commands; delayed work cannot admit late changes.
- Bad score publication: retain coherent prior revision, hold dependent awards, replay to a staged replacement.
- Host loss: restore known release and off-host data, reconcile external effects/quota, verify deadlines before writes reopen.
- Privilege/session compromise: revoke sessions, rotate affected credentials, inspect attributable admin actions and freeze sensitive approvals.

## Identity schema consistency

Better Auth uses unqualified table names on the configured PostgreSQL connection. With a database role named `fantasy` and the default `"$user", public` search path, those tables resolve inside `fantasy` once that schema exists. Application identity checks therefore use the same connection resolution; never assume `public."user"`. Keep the migration and runtime connection search paths consistent. An old empty identity table in another schema is not proof of lost users; inspect resolution before changing or moving data.

## In-app worker observations

Global operations staff can view `/admin/operations` for minute-level game-cycle and hourly maintenance observations, bounded issue references and 30-day run history. Missing or stale runs require investigation; the page cannot replace an off-host monitor during a web/database outage. See [worker health](worker-health.md).

## Scheduled match-source collection

Season schedules live under **Data provider → Schedule match collection**. Review target-season coverage/rights, mapped fixtures and the four-request batch cost before enabling one. Configure `API_FOOTBALL_KEY` only in the private worker environment and set `API_FOOTBALL_AUTOMATION_ENABLED=true` only for the reviewed deployment. The default is `false`; an enabled schedule alone cannot dispatch without worker activation and a reconciled enabled provider account. Synthetic seasons are blocked from native live transport.

The worker's collection task runs each minute, plans one active batch per mapped fixture, and handles at most four request/recovery operations per run. Existing daily/minute quota, dispatch leases, cooldowns and correction reserves remain authoritative. Inspect planned times, progress and hold explanations on the schedule page, provider attempts/evidence on the provider page, and the collection task in Worker health. Requested cadence may exceed available throughput; measure queue lag and source coherence before launch rather than assuming the default cadence is achievable.

A pause prevents new reservations. Already reserved short leases or in-flight requests may finish and remain charged. Changing season settings cancels pending batches; restore recovery still requires pausing and reconciling the provider account before worker restart. Collected responses require a separate owner-approved season acceptance policy before any automatic football observation. The acceptance worker processes at most one complete retained report per run, without extra HTTP, and holds stale, incomplete or ambiguous sources. Regular-time finished reports are supported; live, suspended and extra-time reports require review. Finalized fantasy results retain their correction boundary. Licensed real-data acceptance and the provisional-publication latency target remain unproven. See [governed acceptance](implementation-slice-40.md).

## Connection-loss and cutoff rehearsal

[Slice 43](implementation-slice-43.md) adds a 200-squad PostgreSQL contention/interruption regression and production-container database restart checks. It proves rejected queued late requests, atomic rollback, exactly-once recovery and retained auth limits/sessions; it is not the full sustained HTTP/browser workload above. Failed/uncertain writes still require their existing receipt/idempotency checks. Connection recovery never treats them as successful automatically.
