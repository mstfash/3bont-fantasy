# Slice 15 — Provider quota gateway

Implemented and verified, 2026-09-19. Migration 0014 is applied locally and immutable. No real key was inspected or used, and no provider API requests were sent.

Global data stewards configure the direct API-Football account using verified daily/minute limits and a past reset anchor for its 24-hour windows. Saving pauses calls until a reviewed current-usage reconciliation. Reconciliation cannot lower recorded use and introduces a 65-second safety wait. Provider configuration, current budget, last successful response, cooldown and the latest 50 attempts are visible in Arabic/English administration.

The worker fetch command accepts a typed request file and uses a fixed HTTPS origin, GET-only requests and rejected redirects. Each page, retry and diagnostic needs its own durable reservation. The account lock, a single active dispatch lease, rolling 65-second limiter and minimum request spacing constrain concurrent workers. Ordinary traffic has a separate 90% ceiling; correction/recovery calls remain inside the total limit. Reservations cannot cross the verified daily reset and expired attempts do not authorize another send.

Timeouts, malformed responses and 429 responses stay charged. Lower daily/minute headers only tighten the ledger, including out-of-order responses. Backoff grows on failures and opens a five-minute pause after three consecutive failures. Positive minute headroom is consumed conservatively; stale higher values cannot refill it. A late result cannot release another attempt's dispatch lease.

Responses are bounded to 2 MB. Valid provider envelopes are redacted and retained as checksum-linked evidence; malformed bodies retain only outcome/checksum where available. Repeated identical evidence may reuse a record, but both upstream attempts consume quota. This gateway does not normalize provider football facts into scoring data yet; schema mapping, bulk import, fixture-aware scheduling and coverage validation remain next work.

Disposable PostgreSQL tests pass worker contention, ordinary/correction ceilings, reconnect persistence, verified rollover versus rolling-minute limits, lower/stale headers, timeouts, malformed responses, redaction, evidence deduplication, 429 pauses and restore reconciliation. Full formatting/lint/type/build/unit checks and browser operations pass, including quota setup, reviewed reconciliation, a charged mock request, pausing and Arabic mobile layout. Additional tests cover expired dispatches, reset-boundary refusal, older lease outcomes and oversized bodies with restrictive headers.

After restoring a database, run `pnpm --filter @fantasy/worker provider:pause-after-restore` before restarting any provider fetch. Then reconcile current usage from the provider account. A database cannot independently discover that an older copy was restored without an external restore protocol; this mandatory step is part of the release/restore gate.

Once credentials and quota are verified, `pnpm --filter @fantasy/worker provider:fetch path/to/request.json ordinary` sends one budgeted request. Use `correction` only for settlement/recovery work. It performs no automatic pagination or retry: each additional request must reserve its own allowance. See [gateway design](provider-gateway-design.md) for primary sources and remaining scheduler/import boundaries.
