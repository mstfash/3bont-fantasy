# API-Football historical data review — draft support report

Prepared 20 September 2026 (Cairo). This report has not been sent to the provider. No credentials or account identity are included.

We are testing Egyptian Premier League season `2024`, league `233`, through `https://v3.football.api-sports.io`. Completed-fixture lineups and player statistics disagree about player identities. These differences prevent reliable joins between participation events, minutes and player scores. We have retained the original responses and have not merged identities by name or shirt number.

For each fixture below, compare `GET /fixtures/lineups?fixture={id}` with `GET /fixtures/players?fixture={id}`. Match event context is available from `GET /fixtures/events?fixture={id}`.

| Fixture | Club             | Lineup record                            | Statistics record                      |
| ------- | ---------------- | ---------------------------------------- | -------------------------------------- |
| 1312376 | Smouha           | `146035`, Mohamed Mostafa Mido, shirt 21 | `342744`, Mido Mostafa, shirt 21       |
| 1312378 | El Gouna         | `295234`, Hassan Yassin, shirt 17        | `456457`, Hassan Samir, shirt 17       |
| 1312380 | Pharco           | `356530`, Mohamed Saeed, shirt 25        | `16876`, Mohamed Saeed Shika, shirt 25 |
| 1312383 | Ghazl El Mehalla | Six distinct nonzero IDs                 | Six player-statistics rows use ID `0`  |

The six lineup IDs in fixture `1312383` are `498398`, `498399`, `498400`, `498397`, `312844`, and `498401`. Their corresponding shirt numbers are 5, 24, 33, 25, 1, and 38. These cannot safely be treated as one anonymous player. One name also differs: lineup goalkeeper Ahmed El Nafarawy versus statistics goalkeeper Ahmed Ibrahim.

Please confirm:

1. Which player IDs are canonical for these specific historical fixtures, and whether corrected responses can be supplied.
2. Whether any official historical ID-alias mapping is available, with effective scope/dates.
3. Whether unused listed substitutes receive explicit zero-minute statistics or nullable/missing records, and how clients should verify complete nonappearance.
4. Whether null goalkeeper penalty-save values mean unavailable data or a confirmed zero, and which fields establish that distinction.

The captures were successful HTTP 200 responses. The app currently holds them for review; it does not silently fill missing values, merge different IDs, or publish fantasy scores from them. Detailed raw responses remain in private local storage and can be provided through an approved support channel if requested.
