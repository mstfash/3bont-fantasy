# Slice 18 — Worker health

Implemented and verified 2026-09-19. Migration 0015 is applied locally and immutable.

Game cycles and hourly maintenance now record durable start, completion, attention and failure states. The global staff health page shows the latest state for each task, a bounded 50-run history, processing counts, issue references and Cairo timestamps in Arabic and English. It distinguishes an unobserved or stale worker from successful processing, and exposes no raw exception or participant message content. Read-time filtering and scheduled cleanup enforce the 30-day history boundary.

Typed unit/build checks, nine persistence and 50 application integration cases/subcases pass. Health tests cover running visibility, partial issues, thrown failures without stored exception text, independent concurrent runs, stale detection, global-versus-scoped authorization and retention. Browser checks pass issue display, run references and Arabic mobile layout. A real local pg-boss startup cycle also completed successfully and recorded its outcome; the worker was then stopped to keep subsequent browser fixtures deterministic.

This is in-app operational visibility. External alerts, restore/load measurements and production monitoring remain release gates. See [worker health design](worker-health.md).
