---
status: accepted
---

# Use a modular VPS application with PostgreSQL-backed jobs

Accepted under D04 on 2026-09-18. Use Next.js web/API and a separate Node worker sharing application/domain modules, with PostgreSQL for state and pg-boss jobs. This fits the VPS operating intent while providing transactional scheduling without introducing Redis or a microservice fleet.

## Consequences

Web and worker can restart independently, but one host remains a shared failure domain. Off-host backups, restore and load tests are launch gates. Use verified transactional enqueue and idempotent handlers; external effects do not become exactly-once merely by selecting a queue. Add another service only after measured need; the $100 target is not proven capacity.
