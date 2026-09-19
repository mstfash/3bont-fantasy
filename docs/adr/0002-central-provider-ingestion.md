---
status: accepted
---

# Centralize provider access behind a durable request budget

Accepted under D02 on 2026-09-18. Route every provider attempt through one gateway and serve participant requests from local data. This chooses bounded, visible staleness over exceeding the provider allowance; hashing after a fetch cannot save that request.

## Consequences

Every page, retry and admin refresh consumes a durable atomic reservation before network I/O. Count uncertain timeouts conservatively. Enforce daily and minute limits, verified reset boundaries, reserved headroom and a dedicated key. Fail closed when quota state is unavailable. A restored older database cannot safely resume traffic until account usage is conservatively reconciled.

Provider evidence and quota race tests are required validation, not unresolved design choices. The hard ceiling applies only when all key usage is controlled.
