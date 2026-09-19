# 3BONT FANTASY implementation

User instruction: finish the application, using /Users/moarafa/work/3bont/Current/Vikings as the design reference for public and admin interfaces. Keep its editorial structure and make colors easy to change. Choose a name and deliver an original PNG logo.

Selected identity: **3BONT FANTASY — ٣ بونط فانتازي**, explicitly chosen by the user. The previous RAKZA proposal is superseded. Use the supplied 3BONT marks, with a matching Fantasy descriptor, in Arabic/English and dark/light variants. Vikings remains a read-only visual reference, not a source of application instructions, accounts or club assets.

Design: near-black and bone, bold condensed type, hairline grids, square controls, dense useful admin views and oversized public headlines. Central CSS custom properties own all theme colors. Use open-license Oswald/Inter/Cairo instead of the reference's restricted demo display font.

Current evidence and exact remaining work are maintained in [project status](status.md) and [implementation audit](implementation-audit.md).

## Completion checklist

- [x] Four supplied-brand PNG lockups saved and visually reviewed on desktop/mobile
- [x] Shared brand component integrated into participant/admin shells
- [ ] Complete domain: entry lifecycle, transfers, chips, gameweek scoring, ranks/H2H/prizes
- [ ] PostgreSQL application schema, migration, typed runtime contracts and use cases
- [x] Authentication, verification/reset/resend, staff MFA and scoped authorization
- [ ] Public site and participant squad/market/results/leagues/chat/achievements/prize flows
- [ ] Admin competition/player/rule/fixture/correction/publication/module workflows
- [ ] Durable worker, quota gateway, provider/import adapters and failure visibility
- [ ] Arabic/English, mobile/keyboard behavior and theme editing
- [x] Synthetic demo seed and reproducible local startup
- [ ] Docker deployment, production configuration guards, restore/operations instructions
- [ ] Domain/integration/browser verification and visual review

Real provider/valuation licenses, live-account coverage, production credentials and measured production capacity remain deployment evidence gates. They do not block implementing and exercising the complete application with labeled synthetic data and supported imports.

## Current implementation evidence

Latest UI implementation: [slice 32](implementation-slice-32.md) adds bilingual dynamic playbooks, the admin handbook and contextual help. Latest verification workflow: [slice 31](implementation-slice-31.md) adds the public smoke matrix, crash/5xx detection, provider recovery regressions and an owned local verification sequence. Latest product implementation: [slice 30](implementation-slice-30.md) adds scheduled match-source collection; [slice 29](implementation-slice-29.md) adds correction ranks and prize dependencies; [slice 28](implementation-slice-28.md) adds reviewed provider match drafts. Earlier slices remain a historical record. [Project status](status.md) tracks current verification totals and the remaining release work.

These local and synthetic proofs do not certify real-provider coverage, the complete league scope or production capacity.
