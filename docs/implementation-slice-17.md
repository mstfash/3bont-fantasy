# Slice 17 — Initial valuation price suggestions

Implemented and verified 2026-09-19. No migration is required.

Draft competition setup includes a bilingual starting-price worksheet. Staff choose one valuation currency, maximum source age and independent fantasy-position bounds inside the competition's overall limits. The default age is 90 days. Position-relative midrank interpolation uses integer arithmetic and rounds exact half ticks upward. Equal valuations receive equal suggestions; a single comparable valuation receives the midpoint. Missing, stale, future, incomparable or display-unverified valuations receive no guessed price.

The worksheet stages suggestions into the existing player-pool editor. Pinned prices are retained, missing-value rows retain their manual draft prices, and every suggested price remains editable before reviewed publication. A minimum-cost legal-squad check evaluates the staged selectable pool with club caps and position quotas. It proves one affordable squad when successful; it does not certify price balance or sufficient strategic variety.

Publication reuses the pool command and holds footballer read locks through commit. It checks that the competition is still a draft, the review is no older than 15 minutes, its source fingerprint matches current records and its fantasy positions remain unchanged. The server recomputes suggestions from the reviewed policy and observed date, retaining source documents, suggested and published prices, pins and manual adjustments in the setup audit. Idempotent retries return the original accepted outcome.

This workflow neither enables automatic performance repricing nor converts valuations between currencies. Real target-season source rights/coverage, performance-price replay, drift/affordability comparisons and approval of a production pricing policy remain separate evidence gates.

Strict formatting/lint/type/build checks, 68 domain/authorization/date/request tests, nine persistence and 49 application integration cases/subcases pass. Browser proofs exercise fictional valuations, staging, preserved pins, reviewed publication, retained audit sources and Arabic mobile layout.
