# Configuration lifecycle

Selected under D12, preserving Q13/Q13a. Administrators configure supported capabilities through validated fields and preview; this is not arbitrary executable code or a promise that every new game mechanic needs no engineering.

| Category                                                           | Mutation policy                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Squad size, position quotas, permitted formations, starting budget | Editable in drafts; freeze after the competition's first lock (Q13a).                                                                                                           |
| Club cap, fantasy position assignments, ranking tie policy         | Same structural freeze (D12); new footballers receive a position before joining the pool.                                                                                       |
| Scoring values, captain multiplier, auto-subs                      | New immutable version for future unlocked gameweeks (Q13). Locked rounds retain their version.                                                                                  |
| Transfer allowance/cap/hit cost and selling policy                 | New version from a future editing round that has not opened. Never recost accepted transfers; lower bank cap takes effect at that opening with a published preview.             |
| Chip inventory and windows                                         | Freeze grants/windows for activated entries; allow an audited equal extra grant to all eligible entries in a future unopened round. No selective removal or retroactive expiry. |
| Entry cap                                                          | May rise; may fall only above every existing account's retained entry count, transactionally (Q06a).                                                                            |
| Registration window                                                | May extend prospectively; shortening cannot invalidate accepted entries. Publicly display the change.                                                                           |
| Deadline/fixture assignment                                        | Audited before destination lock; no ordinary reopening of elapsed deadlines. Exceptions use the result review workflow.                                                         |
| Pricing formula and bounds                                         | Future published batches only, after simulation; never change completed transaction prices.                                                                                     |
| H2H schedule/awards                                                | Freeze at edition start / prize registration opening; material changes require a new future edition/pool.                                                                       |
| Chat, sponsor content, moderation                                  | Immediate operational settings with audit; membership and content rules remain enforced.                                                                                        |

Publish flow: draft → validate → preview affected entries/rounds → publish with effective round and revision. Supersede old revisions without erasing them. Concurrent edits require an expected revision and reject stale confirmation. Participant-facing material changes are announced before activation; the default notice period is 48 hours. If the next eligible target is sooner, defer activation. Emergency factual corrections follow their separate policy.

Before first lock but after registration opens, structural edits require validating every existing draft/squad. Block changes that invalidate activated entries or their purchased holdings; use a new competition if repair would be required. “Before first lock” does not authorize silent loss of participant choices.

Historical scoring changes are a separate, permissioned preview/replay operation referencing explicit rule and fact revisions. They do not mutate the normal configuration timeline or participant transfer history.

A feature toggle controls availability, not erasure. Disabling a module blocks new actions while preserving existing standings, awards, audit and earned inventory. Block deactivation that would abandon an active H2H edition, published prize promise or already committed chip; schedule it after settlement. Dependency validation rejects Triple Captain without captaincy, prizes without eligibility/tie rules, or scoring categories without supported data.

## Implemented impact review

Ordinary competition updates show affected/preserved rounds, rule versions and categories, current entry/account counts, entry-limit changes and the scheduled start of transfer/chip availability rules. The preview and confirmation use the same planner. A confirmation based on different aggregate impact is rejected and requires a fresh review; an expired notice period or deadline is also revalidated. The confirmed impact is audited with the rule plan.

The saved-transfer warning counts current active entries above the proposed cap; it does not promise their future balances. Current balances, purchased holdings and accepted transfer deductions are preserved until the applicable ordinary lifecycle transition. Updating the deadline offset only changes future suggestions; existing saved deadlines require their own reviewed calendar command.
