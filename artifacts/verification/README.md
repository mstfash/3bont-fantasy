# Verification artifacts

These are local implementation proofs. They do not establish real-season provider coverage, licensed valuations, production recovery or launch readiness.

| Artifact                                                              | What it records                                                                                               | Reproduce                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Synthetic pricing report](price-calibration-synthetic.json)          | Saved current-pool baseline, two policies, original round observations, calendar and exact simulation results | After building, run `node scripts/verify-price-calibration.mjs` |
| [Pricing engine measurement](price-calibration-engine-benchmark.json) | One bounded local synthetic CPU run; excludes database, serialization and concurrency                         | Input dimensions and measured scope are recorded in the file    |
| [Container proof](container-proof.json)                               | Exact tested Linux image IDs, startup/migration/readiness checks and limitations                              | Run `pnpm container:build`, then `pnpm test:containers`         |

The bilingual pricing screenshots are [English desktop](../web/price-calibration-en.png) and [Arabic mobile](../web/price-calibration-ar-mobile.png). See [slice 26](../../docs/implementation-slice-26.md) and [project status](../../docs/status.md) for verification commands and remaining implementation work.
