# Worker health and operational evidence

Implemented and verified, 2026-09-19. Migration 0015 adds bounded, private worker-run history. Each game cycle and hourly maintenance cycle records its start before executing application work, then records completion, actionable issues or failure. A crash leaves a running record; the UI distinguishes missing/stale observations instead of claiming that a worker is alive. Game cycles are stale after three minutes without a new start, maintenance after 90 minutes.

The game cycle records deadline counts, processed result rounds, achievement changes and prize-case counts. Known workflow failures carry entity references and bounded internal codes, with the first 100 details and a complete issue count. Exception text, credentials and participant/chat content are not written to health records. Failed records include a run reference for correlating server logs. Retain run history for 30 days.

Only global operations readers with a current staff session may view the cross-competition health page. Scoped operators continue using their competition support/result views. No operational button bypasses gameplay idempotency, factual review or award approval. Durable job retries remain owned by pg-boss; this run history adds visibility to cycles that finish with unresolved application issues.

This is application-level evidence, not an external uptime monitor. A database or web outage can also make this page unavailable. Off-host alerts, backup/restore measurements and production monitoring credentials remain release gates.
