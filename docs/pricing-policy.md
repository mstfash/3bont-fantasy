# Pricing and valuations

Q02/Q02a/Q11a/Q11b plus D14. Fantasy money is integer tenths of a fantasy unit; valuations are separate currency amounts with a provider, observed date, source URL/reference and quality state.

## Selection and sale accounting

Price is scoped to a footballer within a Fantasy Competition, not globally shared across all games. Each holding stores its purchase price. Under the default policy, for purchase ticks p and current ticks c: sell = c if c < p, otherwise p + floor((c-p)/2). Alternative supported policy is full current price; selecting it follows the prospective transfer-policy lifecycle. Sale is computed at confirmation from the expected published price revision.

Every acquisition/release updates roster, bank and ledger together. Quotes expire on a conflicting entry or price revision. No negative balances, floating-point money or silent changes to accepted transfers. Market valuation never substitutes for c. Free Hit restoration retains original acquisition ticks; current price continues independently.

## Market valuations at launch

Match data and valuations may have different sources. Store the reported currency/value/observation date without representing a transfer fee as valuation. Show unavailable and stale values honestly; default stale threshold 90 days, configurable per source. Do not convert currencies unless a separately sourced dated exchange rate is recorded. Prefer a single licensed valuation currency for the initial catalogue.

Ingestion and an admin-reviewed import workflow are both supported. Manual rows require provenance and a genuine valuation source; neither guessed numbers nor sample data meet the launch requirement. Unknown footballers can have a manually justified fantasy price while their valuation displays unavailable. A usable, licensed target-season valuation dataset and its coverage report are launch gates; null handling is resilience, not permission to omit the valuation feature.

## Initial suggestion method

Candidate initial template for replay: within each fantasy position, rank footballers with current comparable valuations using midrank percentiles; interpolate between configured position price bounds in integer tenths, rounding to nearest tick with halves upward. Equal valuations get equal suggestions. One known value uses midpoint; zero known values yields no suggestion. Stale/missing/incomparable currencies are excluded.

Default trial bounds are 3.0–15.0 across positions; admin may narrow them. These are simulation inputs, not an empirically balanced Egyptian price catalogue. Admin review must publish every selectable player's starting price. Test that multiple valid 100-unit squads and allowed formations exist, across clubs, and that manually adjusted suggestions retain their rationale.

## Performance repricing candidate

Implement a pure, versioned policy, then calibrate against replay before enabling it. Initial trial:

1. Run once per newly finalized gameweek in chronological order, using each footballer's last three eligible finalized gameweeks under their original effective scoring versions.
2. Use unmultiplied footballer points; no captain, bench, transfer-demand or real-valuation inputs. Require three observed rounds and at least 90 total minutes. Incomplete inputs, insufficient history or active manual price pin mean hold.
3. Compute exact mean points per round, including eligible zero-minute rounds. Default trial bands: mean ≥6 raises by 0.1; mean ≤2 lowers by 0.1; otherwise hold. Thresholds can vary by position. The maximum absolute change is 0.1 per publication batch.
4. Clamp to configured min/max; never alter existing bank or purchase prices. Manual pins have reason, effective time and optional expiry; sync cannot overwrite them.
5. Produce an explainable dry run with every input revision, old/new price, cap/pin reason and total market inflation.

Select calibration by affordability, price drift, position balance, sensitivity to double/blank gameweeks and rule changes. Record trial alternatives and outcomes; a synthetic example cannot certify a production formula. Normal automatic batches are enabled only after the selected configuration passes this gate, but the engine and admin dry-run workflow remain required launch work.

## Publication timing and corrections

Apply prices only to the forthcoming editable round. Pause publication within 24 hours of its deadline; defer to the next eligible editing window. Multiple finalized rounds awaiting publication produce one capped batch, not repeated jumps in a short window. Previous round settlement may lag the next round; never block squad editing waiting for prices.

Every batch consumes its source-round IDs once and publishes atomically. No eligible window at season end means no further game price change. Historical score corrections do not rewrite already accepted transfer prices or issue retroactive bank adjustments; corrected data informs the next eligible batch. Repeated job delivery cannot apply a second change.

## Implemented starting-price review

Draft setup supports the initial suggestion method above with configurable per-position bounds, a single currency and source age. Only valuations with verified display permission enter the comparison; missing, stale, future or incomparable data produces no guess. Pinned rows retain their draft price. Before publication the server binds current catalogue sources and fantasy positions to a review no older than 15 minutes, then retains original sources, recomputed suggestions and actual published/manual prices in the audit. The pool editor's affordability result proves one legal squad, not strategic variety or production calibration. See [slice 17](implementation-slice-17.md).

## Saved calibration experiments

The implemented workspace compares candidate policies using a saved current-pool baseline and recorded finalized rounds, with freeze-aware publication windows, retained source revisions and exact cheapest-squad costs. It labels synthetic evidence and never enables automatic updates; representative licensed data and explicit policy approval remain open. See [calibration design](price-calibration-design.md).
