# Slice 37 — controlled historical rules corrections

A current owner with fresh staff verification can correct one published gameweek from its admin result page. Supported settings are footballer scoring values and thresholds, normal/Triple Captain multipliers, and automatic substitutions. The operation preserves structural rules, recorded deadline selections, captain choices, bench order, consumed chips, accepted transfer deductions, bank/holdings, published prices and the ordinary future configuration timeline.

## Review and publication

The English/Arabic form uses the existing validated scoring controls, contextual help and theme tokens. Preview is read-only and shows changed rules, squad points, overall/classic rankings, H2H consequences and scoped prize projections. Editing exits the approval screen; the editable form and an older confirmation cannot coexist. Confirmation requires a reason/evidence and explicit impact review.

The server binds the exact selection, current round/result revision, candidate rules, original calculation, immutable snapshots, current facts and all canonical downstream impact dependencies. A changed preview is rejected. Current staff authority is checked before reading an idempotency receipt. Competition and dependent fixture locks serialize confirmation against result, configuration, fact and award operations.

The new round-specific rules version and result revision publish atomically through the existing canonical scoring/publication function. A failure rolls back rules, scores, review resolutions, audit and command receipt together. Concurrent identical confirmations return one accepted result. The original correction interval restarts; award approval remains held until its window is final again. This command neither pays nor recovers an award. Existing prize discrepancy and achievement reconciliation retain their normal lifecycle.

The admin page exposes the latest 20 retained calculation versions. Earlier calculation payloads remain stored. Participant playbooks derive the corrected rules from the selected gameweek, while other gameweeks keep their versions. No provider requests, schema migrations or new dependencies are needed.

## Verification scope

PostgreSQL regression covers read-only repeatable previews, strict bounded settings, unchanged-rule rejection, current owner/fresh verification, stale snapshot and fact inputs, injected publication failure including review rollback, incomplete-data holds, concurrent receipt replay, canonical published scores, unchanged participant decisions and future rules, prize projections, retained history, revoked-owner retries, and the 24-hour finality/award hold.

Browser acceptance exercises proposal editing and review isolation, EN desktop/AR mobile layouts, localized contextual help, Arabic confirmation, retained snapshots/calculations, anonymous mutation denial, and dynamic bilingual playbooks. The complete existing smoke/integration/E2E suites remain required. Full local verification passed: 116 unit/harness cases, 121 PostgreSQL cases (nine persistence and 112 application), 56 public smoke combinations and authenticated E2E, including the new correction flow. The browser health monitor reported no crashes, uncaught errors or application HTTP 5xx responses. See the [tested source manifest](../artifacts/verification/historical-rules-proof.json). Protected remote CI also requires Linux container verification before merge.

## Remaining release gates

Exceptional fixture disposition/settlement and evidence-backed participant snapshot repair remain separate work. Provider-specific ambiguity handling, licensed 2026/27 access and valuation rights, real-data calibration, isolated staging, measured deadline load/recovery, retention procedures and operator acceptance are still required. Synthetic tests do not establish live data coverage or production readiness.
