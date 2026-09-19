# Slice 12 — Entry retirement

Implemented and verified, 2026-09-19. Migration 0012 is applied locally and immutable.

Participants can rename their own squad, discard an unactivated draft without participation history, or permanently retire an active squad after reviewing its consequences. All commands bind ownership, expected revision and an idempotency key. Retained drafts and retired entries consume the account's configured competition entry limit; only eligible draft deletion frees a slot. Lowering the limit counts every retained entry.

The authoritative retirement instant preserves rounds whose deadlines have already passed, including when the locking worker has not run yet. A retired entry receives no new snapshots for future deadlines. H2H withdrawal uses the same boundary to preserve locked matches and forfeit future ones; group membership remains available for conversation and history. Public standings label retired squads separately from result finality.

Prize windows containing any deadline after retirement exclude that entry without blocking complete results for other candidates. Earlier prize windows retain normal eligibility checks. Published terms and the retirement confirmation disclose this behavior.

Database tests cover concurrent retries, ownership, a delayed locking worker, preserved transfer deductions, future H2H forfeits, retained entry caps, draft deletion, public retirement status and historical versus future prize eligibility. These use isolated synthetic competitions and controlled deadlines. Full checks and browser rename, retirement confirmation, retained status and Arabic mobile layout checks pass.
