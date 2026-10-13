# Current destination picker validation

This feature is stacked on DEL-89 (`lovelace/del-89-onboarding`). It implements the current single-destination PAT picker and exact path persistence from #27/#42, informed by #26/#40 and superseded #16. It does not implement named destinations (#31–36).

## Connection and discovery boundary

- PAT discovery reads its token from Obsidian SecretStorage and sends GET requests only to `https://api.github.com`. It never calls Cloudflare or the Squido broker. It does not write credentials into destination settings.
- Accounts/organizations are derived from the PAT-accessible repository list, not a broader organization directory. Only repositories with confirmed `permissions.push`, excluding archived/disabled repositories, appear. Missing permission metadata fails closed. Organization approval, Contents permissions and branch protections can still block reads or publishing even when GitHub reports push permission.
- Repository and branch results are paginated (100 items/page, bounded to 100 pages); hitting the bound reports an error instead of silently showing a partial list. No GitHub-supplied pagination URL is followed with credentials.
- GitHub App discovery is deliberately unavailable. The current plugin broker client has authorization/verification/revocation operations, but no authorized installation-token integration for destination discovery. No broker changes, guessed endpoints or PAT fallback are introduced. App publishing remains disabled on the DEL-89 foundation. #26's live installation-scoped acceptance is therefore still gated on that later integration, not claimed complete here.

## UI and data contract

Settings and Welcome / Setup use the same native destination section. Inputs and selects have enclosing labels plus accessible names; status uses a polite live region; controls have native keyboard behavior, visible focus and 44px minimum tap targets. Desktop/mobile and screen-reader acceptance still require real Obsidian review.

The existing `owner`, `repo`, `branch`, `targetFolder` settings remain the one implicit destination. Authentication and destination selection are separate. No migration rewrites existing fields; credentials remain separate references. All four manual destination fields remain available, including when discovery fails or App discovery is unavailable.

Editing/picking stages a local draft. `Save current destination` validates the draft and writes the four fields together, preserving the exact folder string (including a legacy leading slash). Save failure leaves the previous persisted destination intact. Changing account clears draft repository/branch/folder; selecting a repository sets its default branch and root draft folder. These changes do not publish or save automatically.

`Browse target folder` verifies the entered folder at the entered branch and lists only its immediate directory children. Choose a child and browse again for deeper nesting. Manually clear the field to return to root or enter a parent path. Browsing, errors, rerendering and opening settings never save a parent folder. Missing folders can be manually saved for creation when a note is published. File paths, traversal/control-character paths, and oversized Contents listings fail with an explanation. A 404 cannot reliably distinguish a missing path from concealed/revoked repository access; the UI says so.

Existing Publisher behavior is unchanged: the saved folder prefix plus note filename drives one Contents API GET/PUT; a legacy leading/trailing slash is removed only for the outgoing repository path, not persisted settings. No batch publishing, App publishing, automatic publishing, named destination/profile management, or remote branch creation is added.

## Automated gates

Run `pnpm test`, `pnpm run typecheck`, `pnpm run build`.

The destination tests exercise repository pagination/permission filtering, branch/ref encoding, nested folders, file/symlink exclusion, authentication/revocation/approval/network/access errors, missing credentials, invalid responses, large listings, App fail-closed behavior, late mode/view results, native control wiring, empty lists, failed save preservation, exact path reload and the existing Publisher's GET/PUT destination payload. Network responses and native DOM are mocked test boundaries; these are not live GitHub or GUI acceptance.

Production plugin artifact: `dist/main.js`, `dist/manifest.json`, `dist/styles.css`. Generated dist is not committed.

## Human / integration acceptance gates (not executed by Lovelace)

1. In a disposable Obsidian vault, install the dist artifact and test desktop and mobile layouts, Tab/Enter/Space interaction, focus visibility, long names, screen-reader labels/status, and touch targets.
2. In PAT mode, with a narrowly scoped disposable repository token, select account/repository/branch, browse multiple folder levels, explicitly save `/published/articles`, reload Obsidian, and confirm the exact folder and all other destination fields persist.
3. Check a read-only token, empty repository, organization-pending approval, revoked/expired token, branch protection and offline failure. Confirm manual entry still works and failure does not change persisted settings.
4. Publish a disposable note after reload, inspect the confirmation target and resulting branch/path, then repeat using manual fields/new nested folder. Publishing requires Jon's explicit live acceptance; no live publish was performed in this implementation run.
5. Switch to App mode with a stored PAT: confirm discovery is accurately unavailable and publishing does not use the PAT. Live installation-scoped repository discovery requires the separately authorized broker/token integration and is not a working acceptance claim of this PR.
