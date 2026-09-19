# Slice 35 — hypothetical prize allocations for result corrections

## Behavior

A gameweek correction now estimates each affected published prize pool before reopening. It compares allocation from published scores with allocation after replacing the selected gameweek, using one captured current eligibility state for both. Recorded prepared, reviewed, approved and fulfilled decisions appear separately and remain immutable. The projection never prepares, approves, delivers, refunds or recovers an award.

Published prize preparation and hypothetical corrections share the eligibility loader, published-revision aggregation and allocation kernel. The existing strict preparation function still requires final, complete, current results with no open review. The projection has its own holds: unfinished or reviewed other rounds, stale source facts elsewhere in the prize window, unavailable published revisions, incomplete replacements/results, unresolved goods ties and no eligible entries. A held projection does not show partial winners. Current eligibility is explicitly distinguished from eligibility frozen in a recorded decision.

The allocation keeps the published terms for currency minor units, shared ties, residue/unallocated amounts, one award per account and ranking. Group membership comes from history at the eligibility cutoff. Activation dates, verified identity, suspension, exclusions and retirement retain their existing meaning. Ordinary future-rule editing and prize fulfillment controls are unchanged.

## Authority and concurrency

Financial details require scoped prize preparation or approval access. A competition manager without either capability sees operational prize counts and a permission explanation. Prize staff can open correction projections from the prize detail page without acquiring competition-management or private-group-reading powers. Every new route uses the existing authenticated staff/MFA boundary and server-side capability checks.

`result-impact-v3` binds all affected prize projection fingerprints, including current allocation dependencies and recorded decisions. Reopening recomputes the reviewed fingerprint while holding the competition write barrier, shared locks on fixtures across all affected prize windows, and shared account/identity locks. Eligibility changes therefore invalidate confirmation even when the football facts and pool revision have not changed. The audit records counts of available/held projections, not recipient amounts.

## Interface and help

English and Arabic sections show published-score versus projected rank and award, tie residue and unallocated cash. Recorded decisions expand separately. If the published-score baseline cannot be computed, it remains visibly unavailable instead of being invented as zero. Tables preserve internal scrolling and an explicit 200-recipient display limit. Localized tooltips describe current eligibility, cutoff membership and the limits of a projection; the admin handbook includes the direct prize-page workflow for preparers and approvers.

## Verification scope

PostgreSQL regressions compare unchanged estimates exactly with canonical strict allocation; check cash conservation and goods-tie holds; withhold missing/incomplete replacements; enforce other-round finality/review/source consistency; separate prize and competition authority; reject stale account-eligibility confirmation; preserve recorded delivery without command/audit/correction-case writes; and use historical cutoff membership.

Authenticated browser coverage follows prize-page links in English desktop and Arabic mobile, checks projected awards and localized tooltip access, checks viewport overflow, then exercises the existing reviewed reopening flow. Full local verification passed: 116 unit/harness tests, 99 PostgreSQL cases, 56 public smoke combinations and authenticated E2E, plus formatting, lint, strict types and production builds. English desktop and Arabic mobile screenshots were inspected. See the [source-bound proof](../artifacts/verification/prize-impact-proof.json). Required remote CI also verifies Linux containers before merge.

## Remaining work

This slice estimates one gameweek in one competition against currently reviewed facts. The next correction step is a pre-write global fixture preview covering every affected competition, followed by controlled historical rules replay. Current-season provider coverage, licensed valuations, staging and measured load/restore evidence remain separate release gates. No provider requests or live activation are needed for this slice.
