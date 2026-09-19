# Provider normalization — implementation and remaining boundaries

The gateway, identity mappings, response review and [reviewed match drafts](implementation-slice-28.md) are implemented. The current adapter stages ordinary-full-time observations, deriving coherent participation/discipline facts and retaining unknowns when evidence conflicts; reviewed report evidence retains its source attempts and mapping versions. Scheduled source collection is implemented in [slice 30](implementation-slice-30.md). Reviewed ordinary FT event-timeline normalization is implemented in [slice 33](implementation-slice-33.md). Provider-specific validation and automatic validated report acceptance remain open. A successful HTTP response is still not a validated football observation. Build normalization against retained, licensed samples for the bound Egyptian season; the provider's [endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) describes `/fixtures/players` as statistics for footballers who appeared. Absence from that endpoint therefore cannot establish a complete eligibility roster or prove a missing player had zero minutes.

## Input and identity

For one external fixture, retain the exact successful request/evidence IDs for fixture status, player statistics, lineups and events. Validate endpoint, fixture/league/season scope, page completeness and required fields. Read active club/player/fixture mapping revisions consistently; record the revisions used with the normalized observation. Mapping retirement or correction after preview invalidates that preview. No name matching or silent creation of unknown players.

Keep fixture identity separate from scheduling. Source round labels never assign fantasy gameweeks. A changed provider fixture ID, swapped club, replay, awarded score or unsupported terminal status becomes a review case. It cannot overwrite an already played fixture or silently create historical participation.

## Participation and statistics

Preserve unavailable values as unknown. A current club assignment is not evidence of a footballer's historical eligibility after a transfer. Require a reviewed fixture eligibility snapshot from adequate historical source evidence before declaring the roster complete; retain its revision. Unused substitutes and eligible nonparticipants need explicit complete-source evidence, not an empty player-statistics response.

Normalize aggregate appearance, goals and assists only when their definitions are supported by samples. Reconstruct on-pitch intervals from verified participation and event ordering for defensive scoring. Ambiguous same-minute goal/substitution order, incomplete events, red-card continuation, missing minutes or inconsistent totals must hold affected inputs for review. Do not use full-match conceded totals as a substitute for on-pitch conceded goals. Distinguish second-yellow dismissal, a yellow followed by straight red, own goals, saved penalties and shootout events. Ratings never become fantasy bonus points automatically.

## Review and application

A bounded normalization preview contains the evidence IDs, exact mapping/eligibility versions, proposed observation, missing fields and conflicts. A review outcome must explain any unsupported statistic or manually established eligibility. Apply a reviewed observation through the existing canonical match-data transaction so persistent overrides, current fixture revisions and result finality remain authoritative. The normalized evidence links back to the retained source bundle; publishing a fantasy result remains a separate operation.

Automatic ingestion requires an explicitly enabled, versioned source configuration after coverage validation. Its worker identity and audit actions must be distinct from a human staff session. Staff mapping/configuration changes retain current-authority and MFA checks. Retries must not duplicate observations, and unchanged content must not reset correction windows.

## Acceptance evidence

- Golden source fixtures for ordinary play, substitutes at 59/60 minutes, unused bench, double/blank rounds, club transfer, second-yellow and straight-red cases, own-goal correction, penalties and interrupted/resumed matches.
- Missing/null fields, unsupported dispositions, inconsistent endpoint snapshots, changed mappings and ambiguous ordering produce a review outcome without guessed zeros.
- Corrected and removed events preserve source history, persistent overrides and finalized-result review behavior across multiple fantasy competitions.
- Concurrent normalization/application and repeated delivery retain one semantic observation; a stale reviewed preview changes nothing.
- Bilingual staff review, protected source download and material point/rank/award consequences are verified before automatic ingestion is enabled.

This plan does not certify provider coverage. Production field mapping remains gated by the samples and usage rights in [provider validation](provider-validation.md); synthetic cases can exercise failure handling but cannot prove real provider semantics.
