# Applications

`web` runs the bilingual home, competition, account and squad pages, plus the four-logo preview at `/brand`. Verified sessions own squad creation, lineup, transfer and chip commands. Theme and language preferences persist. `worker` connects to PostgreSQL and pg-boss and runs the transactional gameweek deadline handler, with migration and local synthetic-seed CLIs. Both build under the shared strict toolchain.

Staff MFA/session binding, admin screens, complete league/social/prize/sponsor workflows, ingestion and result publication remain in progress. Follow [current build](../docs/current-build.md), [delivery plan](../docs/delivery-plan.md) and [architecture](../docs/architecture.md). A compiling entrypoint does not mean the whole application is complete.
