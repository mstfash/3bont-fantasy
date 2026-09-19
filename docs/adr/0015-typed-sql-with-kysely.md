---
status: accepted
---

# Use Kysely for typed SQL with explicit PostgreSQL migrations

Accepted under the user's delegated implementation decisions on 2026-09-18. Drizzle 0.45.2 fails the project's strict declaration checks, including missing optional-driver types and incompatible query/policy declarations; use Kysely 0.29.6 over the existing pg pool, retain `skipLibCheck: false`, and validate JSON/network boundaries with Zod. Keep immutable SQL migrations, database constraints and real PostgreSQL integration tests: query types alone cannot prove schema integrity or transaction correctness.

This supersedes only the Drizzle tooling choice in the architecture, preserving PostgreSQL, pg-boss, the transaction boundary and the domain/application separation. [Kysely](https://kysely.dev/docs/intro) provides typed tables, columns and selected result shapes without requiring entity repositories or runtime ORM models.
