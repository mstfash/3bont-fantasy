# Slice 01 — Domain calculations and transaction proof

Implemented 2026-09-18. This advances P3.1 and proves a bounded part of P2.4/P2.5. It is not yet the user/admin vertical slice.

## Implemented

- Exact fantasy prices in integer tenths and points in integer thousandths. Decimal-string constructors reject excess precision, nonfinite values and unsafe ranges. Arithmetic canonicalizes zero and rejects unsafe totals.
- Selling-price policies: half positive gain rounded down, full loss, and configurable full-current-price alternative. Tests exercise 40,401 purchase/current combinations and repeated sell/rebuy behavior.
- Initial squad/configuration validation: distinct ownership, quotas, budget, club caps, all eight default formations, full starter/reserve partition and captain/vice constraints. Alternative templates are tested. This initial budget validator is not a transfer-ledger validator.
- Pure per-fixture scoring: appearance, positional goals, assists, clean sheets/concessions, cards, saves, penalties and own goals. Output includes component points, fact/rule references and calculation version. Missing required facts return a blocked result, not a zero score.
- PostgreSQL transaction helper with rollback/connection cleanup and a pg-boss adapter bound to the same transaction connection.
- Disposable-database proof of atomic write/ledger/job rollback, committed job persistence, concurrent idempotency, no overspending, cutoff after row-lock wait and a durable conditional request ceiling.

## Executable checks

```sh
pnpm check
pnpm test:integration
```

The first command checks formatting, type-aware lint, strict typing of source and tests, build and 31 domain tests. Integration is separate and requires Docker: its runner creates an isolated PostgreSQL 17 container, binds only a random loopback port, uses a random temporary password and removes the container in its cleanup path. Seven integration tests run with real PostgreSQL and pg-boss; they do not connect to an existing application database or call a football provider.

The database tables and debit command in the test file are explicitly probes. They are not production schema/migrations, participant transfers or the complete provider gateway. The quota test proves one durable atomic ceiling; production still needs minute/day scopes, reserve priorities, verified reset boundaries, timeout accounting and restore reconciliation.

## Input boundary

Scoring consumes typed, normalized non-shootout facts. A provider adapter must still prove minute/goal ordering, distinguish second-yellow events, handle deletions, exclude shootout events and normalize penalty saves into total saves. The scorer cannot establish those facts from aggregate scores. Tests use clearly labeled synthetic inputs; passing them does not establish Egyptian provider coverage.

Point amounts have three decimal places at most. Fantasy prices have one. HTTP runtime schemas and serialized unit metadata are still to be implemented; callers must not cast arbitrary JSON to these domain types. Unknown statistics are explicitly null in normalized inputs.

## Dependency evidence

Pinned pg 8.23.0, pg-boss 12.11.2, @types/pg 8.23.1 and @types/node 24.13.5. The tested pg-boss 12.33.2 runtime passed the probe, but its distributed declarations referenced an absent ResolvedConstructorOptions and failed with skipLibCheck=false. Several intervening releases showed the same packaging defect. Version 12.11.2 contains the declaration and passes strict checking; no compiler suppression or vendored type patch was added. Revisit this pin when a later release passes both checks.

Drizzle, Next.js, auth and HTTP contracts remain selected design dependencies, not installed or verified integrations. These tests use node-postgres's explicit transaction connection; a future Drizzle transaction must preserve that same-connection guarantee.

## Next slice

Implement versioned gameweek/entry snapshots and transfer accounting, then captaincy, auto-substitutions and chips against that model. In parallel with code, obtain real match/valuation evidence. Add provider runtime validation before accepting any live response. Do not mark complete acceptance scenarios for raw-data normalization or production deadline enforcement based solely on these calculations/probes.
