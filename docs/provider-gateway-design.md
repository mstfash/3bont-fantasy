# Provider gateway implementation

Selected 2026-09-19 under D02/P2.5. Real credentials, account limits/reset evidence and target-season coverage remain unverified. Tests use synthetic transports and local PostgreSQL.

API-Football's [direct getting-started guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) identifies its HTTPS origin, GET endpoints, API-key header, response envelope and pagination. Its [rate-limit guidance](https://www.api-football.com/news/post/how-ratelimit-works) describes daily/minute headers, request smoothing and key/IP protections. These pages do not verify the selected account's quota or reset instant; the gateway requires explicit account evidence before enabling calls.

One globally managed provider account represents the dedicated direct API-Football key. The secret stays in worker environment configuration. Administrator screens and participant pages read local data. Request paths/parameters are typed and fixed to the provider origin; redirects are rejected. Diagnostics, pages and retries all use the same budget.

The provider account stores confirmed ceilings and a confirmed UTC reset anchor for its 24-hour windows. Unknown/reset-unverified accounts remain paused. A restored database requires an explicit quota reconciliation before traffic resumes. An operator supplies a conservative current-window usage baseline and evidence; raising remaining quota in a used window is not allowed by ordinary updates. Daily limits can tighten immediately; increases take effect in a verified new window. A freshly evidenced minute-limit configuration clears an older observed ceiling only while pausing the account, followed by usage reconciliation and the safety wait.

Reservations use the database clock and serialize on the account. Total and ordinary daily counters are separate, preserving 10% for corrections/recovery while keeping both inside the total ceiling. A rolling minute ledger and minimum spacing prevent bursts. A single active dispatch lease per account prevents multiple workers from racing the same key. Every potentially sent attempt remains charged, including timeouts, malformed responses and process loss. Expired work does not send and never refunds its conservative reservation.

Quota headers may only tighten the current ledger. Out-of-order higher remaining values cannot restore allowance. A 429 pauses calls with bounded backoff; repeated transient failures open a circuit. Accepted responses are bounded and retained with checksums and redaction, with typed errors separating missing data from zero values. Repeated identical responses avoid downstream work, not upstream request charges.

The operational screen must show configured/verified state, current usage, reserved headroom, cooldown/circuit state and last success independently of accepted football facts and published scores. An enabled button alone is not completion: concurrent quota/reset/retry/timeout/restore tests and worker dispatch integration are required.

## Reviewing retained responses

Staff can inspect an attempt through its evidence link and download a redacted JSON record. The transport checksum describes the original bounded response before redaction; it is not the checksum of the downloaded redacted file. Request completion time and the first storage time of deduplicated content are shown separately. Malformed JSON/envelopes remain diagnostic evidence under `invalidResponse`, never accepted identity or scoring data. Bodies beyond the size limit and uncertain timeouts retain the attempt/charge without fabricating content. Source markup is displayed as text, with a bounded on-screen preview and protected full download.
