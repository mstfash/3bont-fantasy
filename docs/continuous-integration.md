# Git checkpoint and mandatory verification

The `CI` workflow runs for pull requests, main/codex branch pushes, merge groups and manual dispatch. Every job uses read-only repository permissions. Actions are pinned to reviewed commit IDs; dependency update PRs keep those pins maintainable. The workflow needs no production credentials or paid football requests.

Three independent jobs feed the stable `Required checks` gate:

1. Full reachable Git history scanning with Gitleaks 8.30.1, using a checksum-verified binary and redacted output.
2. Frozen dependency installation, strict formatting/lint/types/build/unit checks, disposable PostgreSQL integration tests, 56 public smoke combinations and authenticated browser E2E. CI generates its own private environment, local mail sink and synthetic database; no developer environment is copied.
3. Linux web/worker image builds and isolated runtime/readiness/migration/worker tests.

Skipped, cancelled and failed dependencies make the gate fail. Branch protection must require this gate from GitHub Actions on an up-to-date pull request, including for administrators. Workflow presence alone does not enforce merging; the live repository setting is verified separately when the baseline is published. No path filters may skip the required gate.

Raw source-chat exports, private environments, database/mail files, runtime logs and generated browser screenshots are excluded from Git. Curated product decisions, source code and sanitized verification records form the checkpoint. Generated screenshots remain local review artifacts; CI does not upload mail, account exports, logs or database snapshots.

Local verification uses `pnpm verify:local` after stopping the preview and worker. Container verification uses `pnpm container:build && pnpm test:containers`. Before committing, run `gitleaks git --pre-commit --staged --redact` and inspect the staged file list. A secret scan is one safeguard, not proof that every possible credential pattern is detectable.

GitHub's [required-status documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) and [ruleset documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) describe current-head checks and app-bound enforcement. The public repository supports required merge checks.
