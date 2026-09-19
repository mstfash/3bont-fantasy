# Product brief

## Intended outcome

Create an Egyptian football fantasy platform that can operate through configured rules, scheduled data ingestion, automated scoring, rankings, and admin workflows. The user's ambition extends to configurable additional competitions and feature modules. A repeatable setup should take an operator from provider connection to a playable competition without direct database edits.

## Confirmed intent

- Egyptian league fantasy experience inspired by FilGoal and Premier League fantasy (S01).
- Initial target: Egyptian Premier League, 2026/27 season. No firm launch date; provider validation, replay and live rehearsal precede a launch commitment (Q07).
- Up-to-date football data, selection prices, points, spending/budget behavior, and rankings (S01).
- Both fantasy selection prices and separate real-world market valuations are required at launch (Q02, accepted).
- Market valuations inform suggested starting fantasy prices, with admin review before publication; subsequent valuation updates do not automatically reprice the game (Q02a, ADR-0006).
- Automation, accuracy, and a dependable starting point; investigate reuse before assuming a full custom engine (S01).
- VPS hosting; API-Football is a candidate, not a verified provider decision (S02, S04).
- Strict provider-request budget, with scheduled polling and potential caching / change detection (S03).
- Admin-operated configuration for existing capabilities, including all the additional modules named in S05.
- Fully typed Turborepo with pnpm workspaces; persistent plans and ADRs (S00).
- First release includes H2H, prizes, achievements, chat, sponsors and Arabic/English alongside core fantasy and both price features. Native apps are deferred (Q03 corrected answer; see release-scope.md).
- Each fantasy competition uses exactly one real football season; multiple fantasy competitions can share its match data with independent rules, squads and standings (Q04, ADR-0007).
- Each fantasy competition supports an admin-configurable squad limit per participant account, including one or multiple squads (Q06).
- Registration windows are admin-configurable; late squads start at zero from the next gameweek whose deadline is open, without historical points (Q06b).

## Users and staff

Participant: selects a fantasy squad, follows performances, and competes.
Operator: configures the competition, monitors ingestion, resolves data problems.
One operating organization manages multiple competitions (Q01). D04 selects scoped staff permissions for competition management, data stewardship, moderation, prizes, sponsors and support in [module specifications](module-specifications.md). Independent customer organizations are outside the first-release model.

## What “out of the box” must demonstrate

A documented setup flow with explicit prerequisites: provider account and verified coverage, a configured season and ruleset, initial player data and prices, admin credentials, email configuration, and infrastructure. Acceptance: bootstrap a clean environment, simulate an entire gameweek, correct a result, restore a backup, and repeat without direct database repairs. Operators handle exceptional data review and prize approval; routine ingestion, scoring and valid finalization are automatic.

## Commercial context

The chat discusses a $10,000 development fee and a $100/month operating target. Record these as planning inputs. Fixed-price scope, launch date, load, recurring cost ownership, support and warranty are unresolved. Previous assistant hour totals are unvalidated estimates, not commitments.

## Selected design and remaining evidence

The user's delegation selects the remaining recommendations in [delegated decisions](delegated-decisions.md). Gameplay, configuration, finality, module contracts and stack now have a written baseline. Unverified evidence remains: exact season/phase coverage, usable valuation source and usage rights, price calibration, actual workload/cost/recovery, and commercial terms. These gates are explicit in [evidence register](evidence-register.md).

## Success criteria

A deterministic replay produces the same standings; duplicate data cannot award duplicate points; locked squads cannot be edited by normal participant actions; no managed request bypasses the quota controller; users can see stale-data status; admins can preview material changes and inspect their audit history. Provisional numeric engineering targets are in [operations](operations.md); their attainment must be measured.
