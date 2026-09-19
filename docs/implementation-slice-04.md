# Slice 04 — Operator forms, sourced valuations and price batches

Implemented 2026-09-19. Extends slice 03; the full launch scope remains in progress.

Competition rules now use ordinary typed form controls for squad structure, formations, transfers, chips, captaincy, substitutions, scoring, rankings and price bounds. Cairo date controls resolve daylight-saving gaps and repeated hours explicitly. Extending an exhausted calendar moves existing entries to the next editable round without granting a second transfer allowance.

Football catalogue screens maintain seasons, clubs and footballers in Arabic/English. Valuations carry exact currency minor units, source URL, observation date and explicit display rights. Unlicensed values are removed before participant data reaches the browser; unavailable and older-than-90-day values are labeled. A valuation edit cannot change a fantasy price. Concurrent catalogue edits bind to a semantic document fingerprint; retries do not duplicate audit evidence. Current club changes preserve historical fixture eligibility and frozen scoring pools.

Performance-price previews use finalized, previously unconsumed rounds, bounded price steps, minimum observed minutes and manual pins. Approval binds to the preview and refuses stale results, reused source rounds and the deadline freeze window. Each editing window has one published batch. Squad bank balances and purchase prices remain intact. Automatic publication remains gated on calibration evidence; manual review is functional.

`pnpm demo:replay` creates a persistent, visibly fictional six-entry league at `/ar/competitions/cairo-replay/standings` and its English counterpart. Three settled rounds use the normal deadline/scoring pipeline; three future rounds allow continued play. The factory is rerunnable without overwriting existing records, creates no authenticated identities or staff grants, and is restricted to local mode.

## Verification

`pnpm check` passes format/lint, strict source and test types, production build, 56 domain scenarios, two authorization tests and two Cairo date tests. Disposable PostgreSQL passes nine persistence and thirteen application cases/subcases, including concurrent catalogue edits, source provenance, price source consumption, deadline freezes and calendar extension.

The real-browser journey now includes catalogue creation and KWD valuation precision, in addition to authentication, MFA, setup, reports, scoring and price approval. Its latest execution and visual review are tracked in project status.

## Remaining work

Bulk/provider import and mapping, automated price calibration, group/H2H workflows, prizes, achievements, chat/moderation, sponsors and staff administration remain. Historical rule replay, exceptional fixture handling, rank/award correction previews and measured operating gates remain explicit. Real provider/valuation coverage and display licenses have not been inferred from synthetic records.
