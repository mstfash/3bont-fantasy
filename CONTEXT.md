# Football Fantasy

A fantasy football game based on real football matches, initially focused on the Egyptian league. Participants select footballers and receive points based on their performances.

## Language

**Football Competition**:
A real sporting competition between clubs, such as the Egyptian Premier League.
_Avoid_: Fantasy competition, participant league

**Football Season**:
One edition of a football competition and the real fixtures belonging to that edition.
_Avoid_: Fantasy competition, gameweek

**Fantasy Competition**:
A fantasy game with its own rules, squads and standings, based on exactly one football season. Multiple fantasy competitions may use the same football season.
_Avoid_: Football competition, football season

**League Group**:
A public or private group within a fantasy competition that compares participants using their existing competition squads and player-scoring rules. A head-to-head group compares those points through matchups.
_Avoid_: Football competition, independently configured fantasy competition

**Operator**:
The organization that runs the platform and manages its fantasy competitions. The first release has one operator, which may have multiple staff members.
_Avoid_: Tenant, individual administrator

**Footballer**:
A real person who plays football and whose match performance can contribute fantasy points.
_Avoid_: User, manager

**Club**:
A real football team for which footballers play.
_Avoid_: Fantasy team, squad

**Fantasy Squad**:
The collection of footballers selected for a fantasy entry, including its starters and reserves.
_Avoid_: Club, real team

**Participant Account**:
The participant's platform identity, which may own several fantasy entries and take part in group conversations.
_Avoid_: Footballer, squad, verified unique human

**Fantasy Entry**:
One competitive participation in a fantasy competition, owning its squad, fantasy budget, transfers, chips and results. An account may own multiple entries where the competition permits it.
_Avoid_: Account, club, league membership

**Head-to-Head Edition**:
A scheduled series of matchups among a fixed set of entries in a league group.
_Avoid_: Football season, real fixture

**Award Pool**:
A published set of prizes with a shared scope, eligibility rules, scoring interval and allocation policy.
_Avoid_: Wallet, automatically executed payment

**Factual Override**:
An attributable operator correction of a football fact that remains effective until explicitly removed.
_Avoid_: Scoring rule, private competition fact

**Starting Lineup**:
The footballers selected from a fantasy squad to start a scoring period.
_Avoid_: Entire squad, club lineup

**Gameweek**:
A fantasy scoring round containing assigned fixtures and a single deadline for squad and lineup selection. A gameweek need not match a calendar week.
_Avoid_: Fixture, calendar week

**Provisional Results**:
Gameweek scores and standings still subject to normal processing and corrections before finalization.
_Avoid_: Final results, official payout approval

**Finalized Results**:
A published gameweek result revision that has completed the correction window and data checks. Later changes require an audited reopening rather than ordinary automatic updates.
_Avoid_: Unchangeable forever, prize fulfillment

**Reserve**:
A footballer in a fantasy squad who is not in its starting lineup for that scoring period.
_Avoid_: Unselected footballer, free agent

**Captain**:
A selected starter whose fantasy points receive the competition's captaincy multiplier.
_Avoid_: Club captain

**Vice-Captain**:
A different selected starter who can receive the captaincy multiplier if the captain does not play during the gameweek.
_Avoid_: Substitute captain, reserve captain

**Chip**:
A limited-use fantasy ability that changes a squad's transfer or scoring behavior for a gameweek.
_Avoid_: Achievement, prize

**Wildcard**:
A chip allowing unlimited transfers without point deductions, with the resulting squad retained afterward.
_Avoid_: Temporary squad

**Free Hit**:
A chip that allows a temporary squad for one gameweek before restoring the previous squad.
_Avoid_: Wildcard

**Bench Boost**:
A chip that includes all squad members in scoring for its gameweek.
_Avoid_: Automatic substitution

**Triple Captain**:
A chip that replaces the normal captaincy multiplier with a total multiplier of three for its gameweek.
_Avoid_: Three times the normal captain multiplier

**Fixture**:
A scheduled football match between clubs, including its eventual result.
_Avoid_: Gameweek, fantasy head-to-head

**Fantasy Price**:
The price charged against a participant's fantasy budget when selecting a footballer.
_Avoid_: Market valuation, real transfer fee

**Market Valuation**:
An estimate of a footballer's real-world economic value, distinct from the price used for fantasy squad selection and from an actual transfer fee.
_Avoid_: Fantasy price, transfer fee

**Purchase Price**:
The fantasy price paid by a particular squad when it acquired a footballer for the current holding.
_Avoid_: Current fantasy price, market valuation

**Selling Price**:
The fantasy budget amount a particular squad receives for releasing a footballer under its competition's selling-price policy.
_Avoid_: Market valuation, real transfer fee

**Fantasy Transfer**:
The replacement of a footballer in a fantasy squad with another footballer.
_Avoid_: Club transfer, real-world transfer fee

**Free Transfer**:
A squad's allowance to make a fantasy transfer without a transfer-related points deduction.
_Avoid_: Free footballer, zero-price purchase

**Fixture Eligibility Roster**:
The complete set of footballers eligible for a particular real fixture, including those who did not play. It describes that fixture’s historical club membership, rather than a footballer’s current club.
_Avoid_: Starting eleven, fantasy squad, current season roster

**Confirmed Non-Appearance**:
An explicit record that an eligible footballer played zero minutes in a fixture.
_Avoid_: Missing participation data, omitted footballer

**H2H Forfeit**:
An entry's withdrawal from a specific future matchup after the edition schedule is published. Locked matchups retain their participants; rejoining a group does not cancel an already recorded forfeit.

**Chip Grant**:
An announced equal addition to the chip allowances of squads eligible for a specified future gameweek. It is separate from each squad's initial allowance and previously consumed chips.

**Award Pool**:
A published set of prize terms for a defined competition or group, scoring interval, eligibility cutoff and rewarded rank positions.
_Avoid_: Wallet, payment pot

**Award Proposal**:
A proposed allocation of a pool's prizes to eligible entries using particular finalized results. It remains distinct from approval and recorded fulfillment.
_Avoid_: Payment, final standings

**Prize Fulfillment**:
The recorded external delivery of approved awards to their recipients.
_Avoid_: In-app payout, score correction

**Achievement definition**:
A named cosmetic milestone with an eligibility window and a condition for a squad or account.
_Avoid_: Reward rule

**Achievement grant**:
A squad's or account's earned badge, attributed to the participation or finalized results that justify it.
_Avoid_: Prize, points bonus

**Group room**:
An optional conversation shared by the current account members of a league group.
_Avoid_: Squad chat, public chat

**Moderation evidence**:
A restricted record of reported or removed content and the decision taken about it.
_Avoid_: Public message history

**Sponsor campaign**:
A scheduled, disclosed partnership placement with approved artwork, localized copy and a destination.
_Avoid_: Personalized advertisement

**Sponsor impression**:
An approximate recorded view of a sponsor placement, distinguished from a click on its destination.
_Avoid_: Unique person reached, billed view

**Entry retirement**:
The permanent end of a squad's participation in future gameweeks, preserving its earned history and used entry allowance.
_Avoid_: Delete squad, reset squad

## Fulfillment correction case

A durable review of changed results or eligibility after an award was delivered. It preserves the original delivery and records the operator's separate decision about any remedy.

## Provider attempt

One potentially sent request to an external football-data provider, including a retry or a page of results. It consumes provider allowance even when its outcome is uncertain.

## Provider quota window

A provider-confirmed interval with a bounded request allowance shared by all work using that provider account.

## Catalogue manifest

A bounded, sourced set of season, club and footballer records with stable identities and expected revisions, reviewed and applied together as one catalogue batch.

## Provider season binding

The association between one local football season and the provider's competition identifier and season key.

## Provider identity mapping

A reviewed association between an external club, footballer or fixture identity and its corresponding local record. Retirement ends its use for new imports while retaining its history.

## Price calibration report

A saved comparison of candidate fantasy-price policies against a defined pool and set of finalized round results. It records hypothetical price drift and squad affordability; it is separate from approval to publish prices.

## Provider match draft

A provisional match report assembled from provider responses for staff review. Its player list and statistics may be incomplete; it does not establish eligibility or final results by itself.

**Provider collection**:
A gathering of a real fixture's provider reports under an operator's season collection schedule. Completed collection supplies sources for review, not accepted match facts or published fantasy results.
_Avoid_: Automatic match approval, scored match

**Historical Rules Correction**:
An authorized correction to the scoring rules of a previously published gameweek, producing revised points from the recorded squads and football evidence.
_Avoid_: Participant squad repair, ordinary future configuration, rewriting accepted transfers

## Fixture Disposition

An evidenced official decision about a fixture's competitive treatment: void with or without a replacement fixture, or an awarded team result with no footballer performance. It determines whether its footballer contributions are excluded and retains the original match history. It is distinct from a temporary suspension, which preserves the same fixture and awaits a complete resumed report.
