# Slice 26 — Saved price calibration experiments

Implementation 2026-09-19, migration `0020-price-calibration`.

Adds a pure replay engine using the existing performance-price policy and exact legal-squad cost solver, scoped report storage with retained source calculation references, current staff-write authorization, retry receipts and audit events. Arabic/English administration compares current and proposed settings, shows price drift and affordability by publication window, and downloads the saved baseline and observations. Existing prices and automatic-operation settings remain unchanged.

See [design and assumptions](price-calibration-design.md). Verification covers pins, exact freeze boundaries, source coalescing, unfinished-round gaps, missing observations, candidate independence, impossible squads, changed-state retries, source retention and authority revocation. Browser checks cover the reviewed form, saved report, authenticated download, anonymous denial and Arabic mobile layout.

Full formatting, typed lint, strict source/test types, production build and 76 unit tests pass. Disposable PostgreSQL passes nine persistence tests and 58 application cases/subcases. The complete browser regression passed, including the report flow, protected download and MFA recovery. Screenshots are `artifacts/web/price-calibration-en.png` and `artifacts/web/price-calibration-ar-mobile.png`; a downloadable synthetic example is retained at `artifacts/verification/price-calibration-synthetic.json`.

Browser verification also exposed a header-logo lazy-loading issue after theme navigation; brand marks now load eagerly. Shared screenshot readiness checks are bounded, and failure diagnostics retain the original error. These are local proofs, not production or real-provider coverage claims.

A saved report reproduces exactly from its downloaded observations and basis fingerprint using `scripts/verify-price-calibration.mjs`. A separate bounded synthetic engine run used 1,000 players, 100 calendar rounds and three candidates (297 simulated batches): 648 ms locally and 32 MiB heap used afterward. This excludes database reads, serialization and concurrent traffic; the measurement is retained in `artifacts/verification/price-calibration-engine-benchmark.json` and is not production load qualification.
