# Real-world market valuation sourcing

## Recommendation

Use API-Football for licensed football facts and a separate, permissioned valuation source. Investigate Transfermarkt first because its [Egyptian Premier League valuation catalogue](https://www.transfermarkt.com/premier-league/marktwerte/wettbewerb/EGY1) contains the relevant market. A public catalogue establishes availability to read, not permission to ingest and redistribute it. We have not verified an official self-service Transfermarkt API or a commercial feed offer for this product. No scraper, unofficial API, purchase or external message was used.

Seek a written supply/display arrangement from the source, or a vendor that can document its right to supply these values. An API marketplace listing alone is insufficient evidence of provenance and usage rights. The actual Egyptian player coverage, update dates and cost must be tested before choosing the vendor. Do not make the launch depend on an unverified free feed.

API-Football's [endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) documents transfer dates, clubs and transfer types/fees. Those historical transactions are different from a current estimated market value. A free transfer or loan must not become a zero valuation. This guide does not document a current market-valuation field.

[Football Benchmark](https://footballbenchmark.com/player-valuation-methodology) is another valuation business, but its published list of 27 covered leagues does not include Egypt. Its estimates normally update at several valuation dates each season. It is not a verified substitute for complete Egyptian coverage. Do not buy it on the assumption that all Egyptian players are included.

## Data contract and update behavior

The application already separates real valuations from fantasy selection prices. It stores amount in currency minor units, ISO currency, valuation date, source name/URL and display-permission status. Public cards show the source/date, flag stale values and show unavailable when display permission is absent. Admin catalogue import and editing exist; an automated valuation feed is not connected.

A future feed must retain the supplier's stable player ID, our reviewed identity mapping, the value's effective date, retrieval time, source revision and licensing reference. Retrieval today must not relabel an older valuation as today's estimate. Preserve prior observations for review, reject duplicates and mismatched identities, and never silently overwrite a newer observation with an older one. Add storage for these ingestion details before wiring an automatic supplier adapter; the current public valuation record alone is not a full feed ledger.

Recommended synchronization is a daily check for new valuation releases, downloading changes only when the supplier publishes them and within its permitted cadence. Values are estimates updated on a source schedule, not live trading prices. Refresh football fixtures on their own budget and valuations on theirs. Display “as of” and “last checked” as distinct facts.

If the source is unavailable, retain the last authorized value with its original date and stale indicator. If no authorized value exists, show unavailable; never invent one, substitute a transfer fee or fabricate zero. The agreed launch still requires both price features, so unresolved supply is a launch gate rather than permission to drop the feature.

Valuations may suggest initial fantasy prices for admin review. Later valuation changes do not automatically change published fantasy prices, squad purchase prices or bank balances. Fantasy-price updates continue through the separate bounded performance policy and reviewed publication process.

## Vendor evidence required

- Full Egyptian Premier League squad list with stable IDs, reserves/new signings and missing-value handling.
- Sample values with original effective dates, currency, revision/correction behavior and refresh cadence.
- Documented permission for our Arabic/English application to display/cache values, attribution requirements and retention after termination; images/logos considered separately.
- Delivery method (official API or licensed export), incremental updates, historical availability, limits and price.
- A reproducible identity/revision import test and an outage/staleness test before activation.

No vendor has been selected or contacted yet. Source access and commercial display rights remain open evidence gates.
