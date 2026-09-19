# Slice 44 — historical testing and deadline discovery

The user selected provider season `2024` only to test the app; the intended 2026/27 launch is unchanged. The local historical draft contains eighteen real clubs and nine opening-round fixtures with original dates, observed match scores and unaccepted player facts. It stays outside public competition pages and worker locking. Atomic creation, idempotent retries, changed-source rejection and preservation of operator edits are covered by PostgreSQL regression tests.

`pnpm test:provider:replay` inspects private saved bundles without network or database access. Invalid provider player IDs no longer crash temporary mapping construction: original data reaches the strict adapter and produces a held diagnostic report. The production adapter still rejects invalid IDs and roster/statistics mismatches. Tests explicitly cover ID zero and a cancelled-penalty VAR event.

The real historical draft exposed a deadline discovery problem: the worker selected the first fifty overdue rounds before excluding inactive competitions. Enough old draft/completed/archived rounds could fill every slot indefinitely. Discovery now joins and filters eligible competitions before limiting the batch; transactional checks still revalidate the competition and authoritative cutoff. A regression queues fifty-one inactive competitions before an active game, proves the active game locks on the first run, and proves inactive rounds and repeat runs remain unchanged.

The homepage decorative numeral now displays the exact original 3BONT numeral through a CSS alpha mask. Proportions are preserved, RTL does not mirror the mark, and `--accent` controls its decorative color. The complete logo assets remain unchanged.

## Real provider observations

Eleven bounded manual diagnostic requests captured three additional completed fixtures. The original fourth sample was already cached. There were nineteen conservative manual reservations in the UTC day, below the twenty-request diagnostic ceiling; the final response reported 86 of the free account's 100 daily requests remaining. The first fresh status read established account usage, requests were serialized with 7.5-second spacing, every potential dispatch was journaled before sending, and failures/insufficient headroom would stop the sequence. Reused fixture-list evidence retains its original timestamp.

This was a pre-configuration local diagnostic exception, not an enabled provider account: the database had no provider account, a session advisory lock prevented concurrent local bootstrap probes, worker automation remained false, and key-sharing status stayed unverified. The diagnostic did not set `dedicatedKeyConfirmed` or weaken the durable production gateway. Its nineteen reservations and provider observations must be reconciled before future gateway activation. No further data calls are needed to replay these samples.

All four sampled matches need review: three have one-for-one lineup/statistics identity differences; the fourth has six statistics rows with player ID zero. No successful complete real-data scoring claim is made. See the [draft provider report](provider-data-quality-report.md) and [sanitized sample evidence](../artifacts/verification/historical-provider-samples.json). The provider report has not been sent.

## Validation

`pnpm verify:local` passed: formatting, lint, strict types, production builds, 124 unit/harness cases, 154 isolated PostgreSQL cases, 56 public smoke combinations and authenticated English/Arabic participant/admin browser journeys. The offline command regression reproduces an invalid player ID without credentials or database configuration and verifies a held report. Eight earlier hero checks cover both themes/locales at desktop/mobile widths.

The first full run exposed two fixtures using just-created host timestamps that PostgreSQL could see as future proofs. Those fixtures now represent a session authenticated one second earlier. Production authorization is unchanged; an explicit unit assertion still rejects either proof timestamp even one millisecond in the future. Application tests, types and lint passed again after that assertion was added. The final full run had zero failures and completed its expected authentication rate-limit wait.

Secret scanning of all Git-visible files passed, including an exact-value check for the configured API key. Private response bundles, credentials and diagnostic journals are excluded. Protected CI must pass before merge, including container runtime and clean-volume backup restoration. Historical fixture data remains a separate coverage gate from passing synthetic workflow tests.
