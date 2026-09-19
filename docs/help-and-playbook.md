# Bilingual help and playbooks

The player guides are available at `/ar/how-to-play`, `/en/how-to-play`, `/ar/playbook` and `/en/playbook`. Each guide supports `competition=<slug>` and `gameweek=<id>`. The competition chooser lists only published, running or completed competitions. An unavailable competition or an invalid round returns 404; it never silently substitutes a different historical rule version.

The admin handbook is at `/ar/admin/how-to` and `/en/admin/how-to`, linked from the dashboard overview, sidebar and page help navigation. It requires a verified staff session. Workflow links follow current role capabilities; saved competition summaries follow the staff member’s competition scope. Draft configuration stays in the protected admin view.

## Source of truth

The selected gameweek’s saved rules drive the player instructions and rules tables. Without an explicit round, choose the first upcoming round whose deadline has not passed, otherwise the last round. A competition without rounds uses its saved competition rules. Show the round, version and actual deadline alongside the explanation. The displayed deadline takes precedence over the default kickoff offset.

Public guides and the existing competition rules page share `CompetitionRulesContent`. This includes squad size, position quotas, formations, initial budget, club cap, captaincy, substitutions, transfer allowance/cost/carryover/sale policy, enabled chips and windows, announced grants, fixture scoring and correction windows. Current registration windows and account entry limits are explicitly competition settings. Ranking, fantasy price bounds, price-policy activation and publication freeze are also shown. Real-world valuations remain separate from fantasy prices.

Editing an admin form is not publication. Shared numeric/toggle rule fields show their current unsaved form values in their localized help text. Public guides read saved gameweek versions on a server request. Existing open pages need a refresh after another operator saves a change; there is no push subscription. Switching language preserves the competition/gameweek query. Scheduled rule changes therefore appear in their effective round, while locked rounds retain their original guide.

## Contextual help

Player and admin shells provide a localized info icon and help navigation on every screen they wrap. Authentication forms provide security help and guide links. Route-specific explanations cover squads, prices/valuations, groups, H2H, chat/moderation, prizes, achievements, profile/privacy, security, competition configuration, catalogue, providers, match reports, results, staff/audit, operations/support and sponsors.

Additional help appears next to every shared numeric/toggle rule field and in squad selection, the player market, competition editing, match editing and reviewed-command forms. These components use explicit semantic help keys rather than guessing from visible text. An info icon is a button with `type="button"`; opening it cannot submit the surrounding form. Its description is linked with `aria-describedby` and rendered as a tooltip. Hover, focus and tap open it; Escape, blur or an outside interaction dismiss it. The tooltip is portaled outside scroll containers and kept within the viewport, including RTL and mobile layouts. Colors and fonts use the shared theme tokens.

## Maintaining the guides

When adding or changing a configurable rule, update its localized meaning and guide presentation in the same change. Read the actual rule version; never paste the default template into guide prose. New shared rule controls require an explicit typed help key. For a new workflow, add its Arabic/English topic, route mapping and handbook steps, with the same authorization scope as the destination tool. Explanations must describe supported behavior without presenting unfinished production automation as active.

Regression coverage must include changed configuration values, historical and future rounds, language-switch context, private/draft visibility, keyboard/touch access, viewport bounds and form non-submission. Continue the existing smoke, integration, E2E and container verification.
