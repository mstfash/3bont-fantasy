# Participant profile and privacy delivery

Implementation continues under the selected launch scope, 2026-09-19. These are application behaviors, not a claim that the operator's legal/privacy terms have been approved.

1. Profile: a verified, unsuspended participant edits their own display name. Synchronize the identity and game records in one transaction; bind the existing name and preserve retry identity. Keep squad names separate. The generic identity update endpoint is disabled so it cannot bypass synchronization. Audit the action without retaining former display names in free text.
2. Game-data export: provide authenticated, private downloads of the participant's own account/game data and current choices. Exclude authentication secrets, other participants' private squads, invitation tokens and restricted third-party moderation evidence. Support a bounded, resumable or asynchronous export for large histories rather than silently truncating results.
3. Account closure: require fresh authentication and a concrete review of owned groups, active squads, outstanding award obligations and privileged roles. Closure must not reset competitive allowances or erase shared scoring/fulfillment evidence. Group handover, entry retirement and restricted retention exceptions must be explicit; privileged operators need another authorized owner before losing access.
4. Erasure/pseudonymization: remove public-facing personal details and ordinary chat content according to the chosen retention policy, retain only necessary restricted competition/prize/moderation records, and expire downloadable archives. Published operator terms, backup retention and external support handling remain launch evidence gates.

Do not equate retirement of a squad with closure of the account, or claim a partial game-data download is a complete legal access response. No real participant has been renamed, closed or erased by development tests.
