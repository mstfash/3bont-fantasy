# Launch module contracts

Selected under D04–D09. Every module below belongs in the first release; staging implementation does not defer it past launch. Core rules live in [game rules](game-rules.md); corrections in [result lifecycle](result-lifecycle.md).

## Accounts and staff

Use Better Auth for verified email/password, password reset and sessions; Resend sends transactional email through a replaceable transport. Rate-limit login, reset, resend and enrollment. Require verified email before activating an entry. Do not implement password cryptography, reset tokens or session security ourselves. Staff require MFA and recent authentication for privilege changes, historical reopening and award approval. Test server enforcement, recovery and revoked sessions; hiding a button is not authorization.

Permissions are named capabilities with competition scope where applicable. Ship role templates: owner (staff/platform administration), competition manager (configuration/entries), data steward (shared football facts), moderator (reports/content), prize manager (award proposals/fulfillment), prize approver (approval), sponsor manager (campaigns), support viewer (read-only operational investigation). One staff member may hold several roles. Owner bootstrap uses an explicit one-time setup process; the first public registrant never becomes owner. Global corrections require global authority. No separate tenant subsystem is implied.

Authorization is enforced in application use cases for HTTP, jobs and admin actions alike. Every participant mutation checks ownership of the exact entry, not just account existence. Default public profile exposes display name, last locked entry snapshot and earned achievements, never upcoming lineup/transfers, email, recovery state or prize contact information. The owner alone can view an unlocked entry's current choices.

## Public/private League Groups and H2H

A group belongs to one Fantasy Competition. Membership selects an existing eligible entry. Default maximum is one entry per account in a group, configurable up to the competition cap before group competition begins. An account may use different entries in different groups. Private groups use revocable invitation tokens and optional organizer approval; public groups are discoverable. Joining never copies or alters a squad.

Classic groups default to competition-to-date points, visibly including pre-join scores. An organizer may choose a future starting gameweek before competitive membership opens. No private rules for player scoring.

H2H uses editions inside a group: draft → registration → schedule published → active → settled. Freeze entry roster at publication before the first scheduled deadline. Use deterministic seeded round-robin pairing and store the resulting schedule. Score matchups using each entry's net gameweek points including transfer deductions. Defaults win 3, draw 1, loss 0; table ties share rank, optional secondary total net fantasy points then shared rank.

Odd rosters receive explicit byes worth zero table points. Publish only complete round-robin cycles that fit the selected gameweek window, so every member has the same number of matches/byes; otherwise shorten the edition or require a smaller roster before publication. Multiple full cycles alternate pair order; no playoffs in the initial template. There is no home advantage. A late joiner may join classic standings but waits for the next H2H edition.

Withdrawal preserves completed matchups and becomes an explicit forfeit for remaining scheduled matches: active opponent receives a win; two forfeits receive zero table points each. A bye stays a bye. Frozen prize rules disclose this behavior. A blank fantasy gameweek compares net scores normally. Unsettled fixture data keeps a matchup provisional; corrections change results, never pairings.

## Prizes

An admin creates an award pool with competition/group scope, scoring interval, eligibility cutoff, rank bands, cash or non-cash items, and a published tie policy. Default eligibility is verified account with entry activated by the pool's opening deadline; late entrants remain eligible only for future pools unless the published pool explicitly allows them. Default maximum one award per account per pool: its highest-ranked eligible entry competes for allocation. Account limits do not prove unique human identity; suspected duplicate accounts create a review case.

For divisible cash prizes, tied eligible entries pool the award amounts across the rank positions they occupy and split equally. Example: 100 and 50 assigned to ranks 1 and 2, two tied winners receive 75 each. Represent amounts with currency/minor units. Round equal shares down and retain any indivisible remainder as an explicitly recorded pool residue; never pick a winner by database ID. For indivisible goods, require a published equivalent-value settlement option or block approval for operator resolution consistent with announced terms. No improvised random tie-breaking.

Award lifecycle: draft → published terms → calculated proposal → eligibility reviewed → approved → fulfilled, plus held/voided states. A proposal references a finalized result revision; newer review/reopening blocks approval and fulfillment. Approval and fulfillment retain actor, evidence/reference and timestamp. Cash approval requires a second staff account distinct from the preparer/recipient; staff cannot award themselves. The same human may operate two roles but not bypass distinct-account approval.

Launch includes award administration and recorded external fulfillment. It does not initiate bank/card payments, hold participant money, charge entry fees or build a wallet. These are separately scoped capabilities, not hidden behind a toggle. Prize terms and cash-program eligibility require the evidence checks before offering real awards.

## Achievements

Start with configurable built-in conditions: entry activated, first finalized positive-scoring gameweek, configured net-gameweek threshold, configured top-rank threshold, and consecutive finalized eligible-round streak. Each definition has localized name/art, condition type, bounded parameters, effective interval and version. No arbitrary SQL/JavaScript expression editor.

Gameplay achievements belong to an entry; account profile can aggregate them with entry attribution. Account participation achievements remain account-owned. Unknown/unsettled rounds cannot extend a streak. Grant once per definition/version/scope; replay recomputes or revokes with reason. Cosmetic achievements do not grant transfers, chips or prize eligibility unless a separately published implemented rule explicitly links them.

## Chat and moderation

One optional text room per group, authenticated members only; one account identity regardless of entry count. No private DMs, attachments or rich HTML initially. Default max 1000 characters, 5 messages per 10 seconds and 60 per hour per account; server-enforced configurable limits. Render text safely, with restricted links and no automatic external embeds.

Participants can report, mute a room and block another account's messages in their view. Blocking is not a guarantee the blocked person cannot read shared-room content. Moderators can remove messages, timeout room posting, suspend accounts and record reasons; group organizers have group-scoped moderation only. Losing membership revokes read/write room access; history permissions are checked on every page, not only on socket connection.

Default messages expire after 90 days. Report evidence is retained separately for 180 days with restricted access; retention/erasure exceptions need a published policy before launch. Users can delete their own message content; retained moderation evidence is not publicly visible. Cursor pagination and foreground polling initially, pausing hidden tabs with backoff; validate load before selecting push transport. Membership removal and moderation apply to subsequent reads immediately.

## Sponsors

Sponsor identity, localized approved assets, link, placement, competition scope, date range and enabled state form a campaign. Start with header, competition page and prize-page slots. Allow only supported media types with upload size/dimension validation; sponsor text has no arbitrary scripts or markup. Campaign priority resolves overlap deterministically and preview shows each locale/device.

Show sponsorship disclosure. Reporting contains aggregate impressions and clicks with bot/rate filtering and clear counting definitions, not individual participant profiles or a billing-grade guarantee. Sponsor staff cannot modify scores, participant eligibility or factual overrides. Staff publishing requires recorded asset authorization and HTTPS destinations.

## Arabic/English and mobile web

Arabic default, English selectable and persisted. Localize participant/admin UI, validation errors, transactional email and configurable public content. Use RTL/LTR layout and logical CSS properties; isolate mixed-direction numbers/names. Provider names remain source text until approved localized names exist; use explicit fallback, not fabricated translations. Require both locales for competition rules, prize terms and important notices before publication.

Responsive keyboard-accessible web is the launch client. Test narrow screens, screen-reader labels, contrast, focus and reduced motion; deadline and stale states must not rely on color alone. Store instants in UTC, use IANA timezone conversion, show currency and fantasy units distinctly. Competitive actions require online server confirmation; offline UI must not imply a transfer succeeded.

Native apps remain deferred (Q03). Versioned HTTP contracts and auth/session boundaries support a later mobile implementation; no mobile app availability switch advertises an unbuilt client.

## H2H withdrawal cutoff clarification

Edition withdrawal or loss of group membership forfeits scheduled matches whose gameweek deadline has not passed at acceptance. Already locked matchups retain their participants and follow normal score/finality corrections, so a participant cannot wait for live scores and then rewrite that contest by leaving. Persist the affected gameweek IDs; later rejoining never erases these forfeits. Registration before publication can be withdrawn without a forfeit. Edition sporting terms and selected rounds are fixed at draft creation; publish after a roster-bound schedule preview and trim unused trailing rounds to complete cycles.
