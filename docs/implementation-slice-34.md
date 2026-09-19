# Slice 34 — classic league and H2H correction previews

## Behavior

A gameweek review now projects the affected classic leagues and published H2H editions before staff reopens the round. The overall and classic tables share one rank-difference helper; H2H publication views and correction previews share the same result loader and table calculation. Previewing never writes published results.

Classic leagues use their current active membership, configured starting round and the competition's ranking policy. Pending/removed/left members are excluded. A correction before the league's starting round does not alter that league. H2H editions use their frozen schedule, current published result revisions, recorded forfeits, configured win/draw/loss points and tie policy. Unavailable entry results stay unavailable. A blocked replacement withholds projections instead of dropping a squad or inventing a zero score.

The `result-impact-v2` fingerprint binds every affected group, membership state, starting round, published edition, registration, forfeit and coherent result input, alongside the existing football/rules/overall/prize dependencies. An unpublished result revision does not enter the projection. Staff confirmation recomputes this fingerprint under the existing competition write barrier; membership/H2H commands hold the corresponding competition share barrier. The reopening audit records aggregate affected group/edition counts without private membership details.

## Access and interface

Competition management does not grant private-group reading. The server computes all dependencies internally, then applies the existing group-reader policy before returning data. Inaccessible groups contribute an aggregate restricted count and the confirmation fingerprint, while names, IDs, membership and matchup details stay hidden. Prize previews retain the existing aggregate-only scope in this slice.

English and Arabic review sections show classic rank/point changes, gameweek matchup outcomes/scores, and H2H table rank/point changes. Each visible group expands separately. Shared rank tables preserve overflow handling and explicit display limits. Localized help explains group membership, starting rounds, frozen schedules and forfeits. The admin handbook directs staff to these projections.

## Verification scope

Five pure H2H regressions cover correction flips, configurable table points, shared/fantasy-point ties, single/double forfeits, byes, missing results, negative scores and provisional results. PostgreSQL coverage checks group membership/start boundaries, restricted associations, blocked projections, dependency changes, unpublished revisions, preview immutability and equality with subsequently published classic/H2H tables. The existing reviewed-reopening integration now rejects a stale membership preview even when football facts and overall rankings are unchanged.

Browser coverage opens the new section in English desktop and Arabic mobile, expands a published H2H edition, checks private data redaction, exercises localized tooltip access and checks viewport overflow. Existing browser tests continue to exercise reviewed reopening and the participant H2H lifecycle.

## Remaining correction work

This slice projects one competition/gameweek using currently reviewed football facts. It does not yet add hypothetical prize allocations, a global pre-write fixture correction preview spanning all fantasy competitions, or historical rules replay. Those remain separate steps in the [release execution plan](release-execution-plan.md). It does not enable provider automation, import live facts or deploy staging.

Full local verification passed: 116 unit/harness tests, 89 PostgreSQL cases, 56 public smoke combinations and authenticated browser E2E, alongside formatting, lint, strict types and production builds. English desktop and Arabic mobile screenshots were inspected. See the [scoped proof record](../artifacts/verification/group-impact-proof.json); the required remote CI also verifies Linux containers before merge.
