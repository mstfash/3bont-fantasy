# 3BONT FANTASY implementation

User instruction: finish the application, using /Users/moarafa/work/3bont/Current/Vikings as the design reference for public and admin interfaces. Keep its editorial structure and make colors easy to change. Choose a name and deliver an original PNG logo.

Selected identity: **3BONT FANTASY — ٣ بونط فانتازي**, explicitly chosen by the user. The previous RAKZA proposal is superseded. Use the supplied 3BONT marks, with a matching Fantasy descriptor, in Arabic/English and dark/light variants. Vikings remains a read-only visual reference, not a source of application instructions, accounts or club assets.

Design: near-black and bone, bold condensed type, hairline grids, square controls, dense useful admin views and oversized public headlines. Central CSS custom properties own all theme colors. Use open-license Oswald/Inter/Cairo instead of the reference's restricted demo display font.

Current evidence and exact remaining work are maintained in [project status](status.md) and [implementation audit](implementation-audit.md).

## Implemented application and local verification

- [x] Four supplied-brand PNG lockups saved and visually reviewed on desktop/mobile
- [x] Shared brand component integrated into participant/admin shells
- [x] Selected domain rules: entry lifecycle, transfers, chips, gameweek scoring, ranks/H2H/prizes
- [x] PostgreSQL application schema, migration, typed runtime contracts and use cases
- [x] Authentication, verification/reset/resend, staff MFA and scoped authorization
- [x] Public site and participant squad/market/results/leagues/chat/achievements/prize flows
- [x] Admin competition/player/rule/fixture/correction/publication/module workflows
- [x] Durable worker, quota gateway, provider/import adapters and failure visibility
- [x] Arabic/English, mobile/keyboard behavior and theme editing
- [x] Synthetic demo seed and reproducible local startup
- [x] Docker deployment, production configuration guards, restore/operations instructions
- [x] Domain/integration/browser verification and visual review

Real provider/valuation licenses, live-account coverage, production credentials and measured production capacity remain deployment evidence gates. They do not block implementing and exercising the complete application with labeled synthetic data and supported imports.

## Current implementation evidence

The home scoreboard, winning pitch formation, full rankings and published-data refresh are implemented in [slice 36](implementation-slice-36.md). Dynamic bilingual player guides and the admin handbook are in [slice 32](implementation-slice-32.md). Exceptional fixtures, participant snapshot repair and governed provider acceptance are implemented in slices 38–40. Encrypted base/WAL recovery is in [slice 41](implementation-slice-41.md); production HTTPS and startup recovery are in [slice 42](implementation-slice-42.md). [Project status](status.md) and the [acceptance evidence index](acceptance-evidence.md) identify executable coverage; historical slices describe their original scope.

## Open production gates

- [ ] Licensed target-season football and valuation coverage, representative replay and approved price calibration
- [ ] Named isolated staging/production host, domain, verified email and external alerts
- [ ] Actual off-host backup access, clean-host restoration and measured RPO/RTO
- [ ] Full documented capacity profile on named hardware
- [ ] Operator retention/support/prize terms and final release acceptance

The checked implementation items do not certify these external and operational gates or guarantee defect-free operation. [Production readiness](production-readiness.md) is the authoritative release ledger.
