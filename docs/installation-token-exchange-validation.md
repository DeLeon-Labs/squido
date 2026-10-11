# Installation-token exchange and repository-discovery validation

## Current capability boundary

The exchange prerequisite from PR #66 is now integrated in source with the shared auth lifecycle and the repository picker. Production activation remains **disabled** by `APP_REPOSITORY_DISCOVERY_RELEASED = false`. There is no persisted settings toggle, developer-build bypass, speculative capability probe, or PAT substitution. An injected controller capability is used only in local tests; the production plugin supplies no override. This is not evidence of live repository discovery or App publishing.

Broker PR [#9](https://github.com/DeLeon-Labs/squido-auth-broker/pull/9) remains open/unmerged at `0bb73ed7f5baadd6f49fb7fd614b255ee9aa74bc`. Its inspected POST `/auth/github/token` contract permits only `repo_discovery` / `metadata: read`; authenticated broker state derives installation context. Success returns a short-lived token, rotation, expiration and binding metadata. No broker-source increment was needed.

## Shared local lifecycle

`AuthLifecycle` serializes entire operations, including SecretStorage writes and connection metadata commits, not just transport promises. Connect, verify, disconnect, repair, clear-pending, polling, token exchange plus repository pages, user-settings writes, PAT local writes and mode transitions share one FIFO owner. Internal methods avoid reentrant queue waits. Queued obsolete polls check current flow identity before dispatch.

Auth mutations synchronously increment a monotonic generation, invalidating pending/cached repository metadata even through A→B→A changes. Local/mode transitions also fence older queued auth operations. An already dispatched token exchange may still save its valid rotated grant to SecretStorage while its discovery generation is obsolete; it must do so before the queued verification/revoke can use that grant. The stale token is then withheld from GitHub, or a stale GitHub response is discarded. Mode transitions wait for the full earlier operation before changing mode; no broker request starts after PAT commits. Pause/unload closes admission and drains operations, without throwing away already successful rotation writes.

Picker results/selections/saves are generation-checked; explicit destination saves check again at queue commit time. User-settings snapshots cannot overwrite fresh auth state or credential references. Broker URL edits invalidate pending flows rather than polling old flow IDs against another broker. Existing connected sessions retain their recorded broker origin; token exchange requires that connection-bound origin, never falls back to an arbitrary current UI URL. Successful verification validates preserved connection/installation/device identity before replacement and resets a blocked exchange instance; setup completion similarly establishes a new instance. A mode switch does not reset uncertain vending.

This is single-runtime coordination, not cross-device/global KV consistency, an atomic transaction with GitHub, or protection against malicious plugins/runtime code. Network requests are not abortable through Obsidian requestUrl; a drain can wait for network completion. JavaScript cannot guarantee credential erasure or prevent a malicious callback retaining strings. The production repository callback returns metadata only, never tokens.

## Token and direct GitHub boundary

- HTTPS broker origin required; userinfo/path/query/fragment rejected before credential reads.
- Fixed request body: grant, device identity, `repo_discovery`. No note content, vault path, destination, arbitrary installation/repository ID, or permission request.
- Response requires no-store, matching connection/installation, binding, grant rotation, valid expiry and exactly metadata-read permission. Token must have 30 seconds remaining and no more than one hour remaining.
- Only replacement broker grants are persisted, through the SecretStorage CredentialStore. Installation tokens exist transiently inside the operation. Raw broker diagnostics no longer print response payloads, which can contain grants.
- No automatic mint retry. Uncertain exchange/context/storage failure blocks the instance until successful verification/reauthorization. Repository API failure does not remint within the operation; any later explicit discovery request is a new operation using the replacement grant.
- Repository discovery calls only fixed `https://api.github.com/installation/repositories?per_page=100&page=N` URLs; no `/user/repos`, redirects via response-provided links, contents calls or publishing requests. Pagination validates declared total, stable count, unique repository IDs and complete rows, returning no partial result on inconsistent access/listings. Bound: 100 pages / 10,000 repositories.
- App listings represent installation-visible metadata, not confirmed push access. Read-only repositories are not filtered out. PAT discovery remains separate, retaining confirmed push filtering and Contents API branch/folder support.
- App branch/folder loaders and publishing remain fail-closed; metadata-only tokens are never used for those operations. Manual destination fields remain available and explicit-save only.

## Actual local evidence

- `pnpm test`: 112 passed, zero failures (mocked network/Obsidian boundaries, real controller and SecretStorageCredentialStore).
- `pnpm run typecheck`, `pnpm run build`, `git diff --check`: exit 0.
- Coverage: closed release gate before network/credentials; integrated exchange→rotation→GitHub metadata; verify/disconnect/repair/mode draining; delayed credential commits; stale and ABA pages/queued operations/UI choices; blocked uncertain exchange recovery; context substitution; pagination/totals/malformed responses/expiry/errors; no token persistence/raw response logging; existing PAT publishing regression tests.
- Review bundle in the isolated worktree `dist/`: main.js, manifest.json, styles.css. Generated files are not committed. No live broker/GitHub, GUI/platform-storage acceptance, publishing or deployment tests performed.

## Independent review and corrections

One separate read-only Codex `gpt-5.6-sol` / Medium review completed with exit 0. It found a medium no-op refresh regression: focus/visibility checks advanced the generation even without pending auth work. Lovelace fixed admission so no-pending/throttled refreshes and obsolete polls do not advance generation; actual pending polling still does. Regression tests verify cached generation remains usable for a destination save. Lovelace also changed resume-pending expiry writes from fire-and-forget to awaited writes inside the queue, with a delayed-write drain test. Final 112-test suite, typecheck and build passed after these fixes. The reviewer did not rerun tests or review the subsequent fix diff; no second worker/pass was launched. Same-family separate harness does not guarantee independent judgment.

## Real gates (later, not an action required now for source delivery)

1. Review/accept the plugin stack #63→#64→#65→#66 and this increment, plus broker PR #9; merge only with explicit approval.
2. Authorize any broker rollout and permitted live vending verification separately; verify HTTPS/no-store/isolation/rotation against the actual deployed contract. No credentials or deployment changes are commissioned here.
3. Only then approve/review a source change opening the release capability, with real installation repository selection and macOS/iOS GUI/storage/approval/revocation acceptance.
4. Separately review contents-read/write purposes and repository scope before App branch/folder content browsing or publishing. Operator access/installation changes and any live publish remain manual approval gates.

GitHub #26 remains integration/live-acceptance gated, not auto-closed. #27 App contents operations remain unavailable. Named destinations #31–36, websites, redesign and infrastructure detours remain out of scope. No implied continuation after this checkpoint.
