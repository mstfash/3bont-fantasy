# Slice 27 — Configuration impact review

Implementation 2026-09-19. No schema migration.

Competition updates now have a read-only, scoped preview using the same validation and per-round rule planner as confirmation. The Arabic/English editor shows immediate metadata categories, current account/entry counts, the entry cap before and after, each round’s rule version and changed categories, preserved rounds, and the effective round for transfer/chip availability changes. A changed deadline offset does not silently move saved deadlines.

The preview binds proposed configuration values, current competition revision, aggregate entry counts and exact before/after round rules. HTTP updates require its fingerprint; confirmation repeats validation under the staff-authority barrier and competition/round locks. Changed impact is rejected without writes. Routine form edits invalidate the preview, including while the preview request is in flight. Accepted commands retain the reviewed impact in the audit trail and support identical retries under current authorization.

The preview reports active entries whose **current** saved free-transfer balance exceeds the proposed cap. It does not forecast future balances, transfer deductions or participant actions. Balances remain unchanged until their normal transition into the effective round. Current private lineups and account identifiers are excluded from the response.

Both the application command and HTTP boundary require the preview fingerprint for every successful update. This is an optimistic concurrency check, not an authorization credential or separate approval role. Both preview and confirmation independently enforce current scoped staff authority and recent verification. No preview records, reservations, migrations or expiry secrets are introduced.

Verification includes read-only previews, identical preview reproduction, scheduled-versus-committed versions, stale populations/proposed values/schedules/deadlines, entry-cap restrictions, future cap effects, audit evidence, retry behavior and scoped authority revocation. Browser coverage includes the missing-preview rejection, English confirmation, Arabic mobile layout, form invalidation and a delayed-response race. Full formatting, typed lint, strict source/test checks, production build and 76 unit tests pass. Disposable PostgreSQL passes nine persistence cases and 62 application cases/subcases. The full browser regression passes, including authentication recovery. English desktop and Arabic mobile screenshots are saved as `artifacts/web/configuration-impact-en.png` and `artifacts/web/configuration-impact-ar-mobile.png`. The local production preview serves this build; Linux images were not rebuilt in this slice.

Historical rule replay, result/award correction impact, provider normalization, real-data pricing approval and production evidence remain separate work.
