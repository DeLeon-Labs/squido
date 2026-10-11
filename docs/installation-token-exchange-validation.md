# Installation-token exchange prerequisite

This increment adds a dormant, tested `InstallationTokenExchange` integration seam, not working GitHub App repository discovery or publishing. It has **no production call site**; production bundling therefore need not include it. The existing App picker and publisher remain fail-closed. PAT mode remains separately functional, never an App workaround.

## Contract inspected

Broker PR [#9](https://github.com/DeLeon-Labs/squido-auth-broker/pull/9), head `0bb73ed7f5baadd6f49fb7fd614b255ee9aa74bc`, implements POST `/auth/github/token` with grant, device identity and fixed `repo_discovery` purpose. The broker derives installation identity from authenticated state; only `metadata: read` is requested. Success includes a rotated broker grant, its expiry, token expiry, installation/connection identity and device-binding flag. There is no contents-read or write purpose. No broker-source change is necessary for this prerequisite.

## Safety contract

- Only explicit App/connected context with HTTPS broker origin is accepted. URL userinfo, path, query and fragment are rejected before credential access. Future integration must bind that origin to the connected account's trusted broker configuration, not accept an arbitrary UI URL.
- Request body contains only grant, device identity and fixed purpose; no note, path, destination, arbitrary installation or permission request.
- Success requires no-store, matching connection/installation, device binding, rotation, valid expirations, and exactly metadata-read permissions. Installation token must have more than 30 seconds remaining and at most one hour remaining.
- Replacement grant goes only through the existing CredentialStore/SecretStorage implementation before the callback receives an installation token. Tokens are never written by this module to settings, vault files, logs or storage.
- The callback may use authorization only transiently for direct installation-scoped GitHub repository metadata discovery. It must not cache, log, return or persist credentials, request contents or publish. JavaScript cannot guarantee erasure of strings or prevent a malicious caller retaining them.
- One exchange instance admits one operation at a time; no automatic retry occurs. Any exchange/context/storage failure blocks that instance because upstream vending or rotation may already have occurred. Verification/reauthorization is the explicit recovery gate; constructing a new instance is not a recovery mechanism by itself.
- Future lifecycle integration MUST drain this instance before verification, disconnect, repair, mode changes or any other grant mutation. Context/grant rechecks detect observed changes but do not implement cross-module atomic compare-and-set or serialize the existing controller. ABA changes are not prevented. Do not wire the module live without that lifecycle coordination.
- A callback error propagates without reminting. A later separately initiated operation reads the rotated grant afresh.

## Evidence

Baseline: 35 tests passed. Increment: `pnpm test` passed 72 tests, zero failures; includes real SecretStorage implementation with mocked Obsidian storage/network boundaries, substitution/scope/expiry/no-store failures, grant rotation failure, overlap, mode changes and external rotation. `pnpm run typecheck`, `pnpm run build`, and `git diff --check` passed. The launchable Obsidian review bundle is in this worktree's `dist/` (main.js, manifest.json, styles.css); generated artifacts are not committed. No live broker/GitHub calls, GUI acceptance, credentials, deployment or publishing were performed.

Separate read-only Codex review (`gpt-5.6-sol`, Medium, existing authentication, on-request approvals) completed with exit 0 and no actionable security/correctness/regression findings. Reviewer also reported direct typecheck, 37 targeted tests and staged diff-check passing; no implementation edits. Different harnesses in the same model family do not guarantee independent judgment.

## Smallest remaining scope (not commissioned continuation)

Accept broker PR #9 security review and separately authorize any merge/deployment/live vending validation. A subsequent plugin increment must integrate one shared lifecycle gate and installation-scoped GET `/installation/repositories` metadata discovery, without writable-PAT filtering or implying write access. Branch/folder contents and App publishing require separately reviewed purposes, scope contracts and operator permission approval. Installation access changes remain manual approval gates. PRs #63 → #64 → #65 remain stack dependencies; this increment is stacked on #65. Saved destinations #31–36, website workflows and broad redesign are excluded.
