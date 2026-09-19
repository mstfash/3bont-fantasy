# Egyptian 2024/25 test rehearsal

Selected by the user on 20 September 2026 (Cairo): use API-Football's season parameter `2024` only for testing. The intended 2026/27 launch is unchanged. Provider league ID is `233`; the retained season record runs from 30 October 2024 to 1 June 2025. Historical matches must not be relabeled as current fixtures or mixed into the synthetic demonstration season.

## Offline real-data replay

Run `pnpm test:provider:replay` from the repository root. It rebuilds the current adapter and reads the four private response files at `.local/provider-validation/2026-09-19-replay-{fixtures,players,lineups,events}.json`. Optional `--prefix`, `--fixture` and `--report` arguments select another saved Egyptian 2024 bundle. Missing inputs fail with an actionable error; the command never fetches replacements.

The command does not load credentials, call the provider, connect to the database, enable collection, accept facts or publish points. Temporary identities test the adapter's mapping boundary; they do not establish a reviewed production catalogue. Raw provider responses remain private. The report includes source checksums, the source commit and dirty-tree status, fixture scope and the adapter's actual result.

The default report is `.local/provider-validation/historical-replay-report.json`. A successful command means inspection completed, not that the fixture passed acceptance. Check `result.outcome`, `result.code` or `result.issues`; `accepted` is always false in this inspection workflow.

## First captured fixture

Fixture `1312376`, played on 30 October 2024, was replayed through the current adapter. The provider's roster and statistics disagree: one listed player has no statistics row and one statistics player is absent from the roster. The adapter holds the bundle with `normalization-lineup-conflict`. The retained events also include `Var / Penalty cancelled`; that event does not establish a scored or missed penalty.

The existing one-for-one roster mismatch regression already covers the identity failure. The timeline regression now explicitly includes the observed cancelled-penalty event, which must remain a review case without derived timeline facts. Do not replace missing minutes with zero, discard the conflicting player or remove the VAR event just to produce scores.

## Test order and evidence limits

1. Replay saved 2024 responses without quota usage; record complete drafts and review holds separately.
2. Run unit, PostgreSQL integration, public smoke and authenticated English/Arabic browser suites. These synthetic scenarios exercise full participant/admin workflows independently of the real-data hold.
3. Review the identity discrepancy against authoritative evidence, then exercise the normal admin correction and acceptance workflow in an isolated historical test competition. No unverified substitution of identities is authorized by this rehearsal.
4. Expand to additional saved or budgeted 2024 match bundles, covering substitutions, cards, penalties, goal corrections and unused reserves. All new outbound requests use the durable quota gateway after account usage reconciliation.
5. Complete the dated competition rehearsal and deployment/load/recovery checks. Historical samples do not prove current-season access, live correction latency, real-world valuations or production capacity.

The provider-use question remains documented as unverified, as agreed with the user; it is not treated as a confirmed extra licence requirement or a blocker to this offline testing.

## Isolated draft setup

`pnpm test:historical:setup` builds the worker and creates the local-only `egypt-2024-test` draft from the retained fixture capture. The CLI rejects non-local environments and non-loopback databases. The source must be a successful complete Egyptian league `233`, season `2024` response with nine completed opening-round fixtures and eighteen distinct clubs. It retains original kickoff dates and observed match scores, while every fixture remains `factsComplete: false`. No player performances, fantasy points, prices, valuations, provider mappings, schedules or account credentials are created.

The season, clubs, competition, round, fixtures and assignments are inserted atomically. A source checksum and external fixture references are retained in the creation audit. Concurrent runs create one draft; subsequent runs preserve operator changes. A changed opening-round source is rejected for explicit admin review instead of overwriting the draft. The draft is excluded from public competition reads and cannot be locked by the deadline worker. Provider club names are preserved in both locale fields pending the Arabic catalogue review; neutral colors are not claims about official club branding.

Local draft: `/en/admin/competitions/5e6a9a08-267f-4338-a737-e25be4aee715` (Arabic uses `/ar/admin/competitions/5e6a9a08-267f-4338-a737-e25be4aee715`). Setup was run twice: first `created`, then `exists`. This is a historical setup baseline, not a claim that users registered before the actual 2024 cutoff. Historical squad snapshots and the successful match/correction rehearsal remain to be prepared in an isolated test database.

### Source discrepancy investigation

The captured Smouha lineup identifies number 21 as `146035 / Mohamed Mostafa Mido`; its statistics instead identify `342744 / Mido Mostafa`, number 21, defender, 90 minutes. The matching shirt number and similar names suggest a duplicate provider identity. [Contemporaneous lineup reporting](https://darelhilal.com/Print/2651239.aspx) names ميدو مصطفى in Smouha's defense, supporting the name but not establishing the relationship between API-Football's two IDs. The records have not been merged and the original bundle remains unchanged.

Normal gateway activation still requires verified key ownership and reconciled usage. No account has been configured with an unverified `dedicatedKeyConfirmed` claim. Subsequent user authorization to continue was handled with a tightly bounded pre-configuration local diagnostic: eleven requests, each journaled before sending, with fresh status/headroom, exclusive local locking, spacing, a twenty-reservation daily ceiling and automatic collection disabled. This avoids treating the unknown key-sharing fact as permission to enable background traffic. See [slice 44](implementation-slice-44.md) for the complete bounds and evidence.

Three additional bundles were captured: `1312378`, `1312380`, and `1312383`. The first two have lineup/statistics identity discrepancies; the last contains six statistics rows with player ID zero. They remain held. Invalid IDs now produce a structured replay report rather than a utility crash. The original sources are unchanged. The [draft provider report](provider-data-quality-report.md) records the exact discrepancies and questions; it has not been sent.

The draft-import and inactive-deadline regressions passed along with all 144 application PostgreSQL cases. It verifies rejected season/error/pagination/identity inputs, concurrent idempotency, preservation of admin edits, source-drift rejection, absent footballer imports, private public-reader behavior and draft deadline protection. Application/worker builds, lint and strict types passed. No additional API requests were used.

## Local verification — 20 September 2026 (Cairo)

`pnpm verify:local` passed on the local working tree based on `d131563`: formatting, lint, strict types, production build, 124 unit/harness cases, 154 isolated PostgreSQL cases, 56 public smoke combinations, and authenticated English/Arabic E2E. Browser coverage includes squad/chip changes, deadline locking, incomplete-data holds, scoring, rankings, historical repairs/corrections, prizes, dynamic help, fixed sidebar/RTL layout and staff MFA. The authentication rate-limit wait completed normally. These workflow fixtures are synthetic and do not turn the held 2024 match into accepted data. The first full attempt exposed host/VM timestamp assumptions in two staff test fixtures; the corrected run passed, with strict future-timestamp rejection preserved. Containers, off-host recovery and production load were not rerun in this local pass; required CI includes container runtime and clean-volume recovery, while actual off-host recovery and production load remain deployment gates.
