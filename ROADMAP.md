# Squido roadmap

Squido is a content synchronization and publishing bridge. Obsidian is the editing surface. GitHub is the first publishing backend and the canonical published content store. Squido connects sources to destinations, tracks bindings, and helps users publish, import, and reconcile content without becoming a CMS.

Roadmap items belong to the milestone where the concept becomes necessary. Earlier releases should avoid pre-building later architecture.

## 0.1.x — Alpha publishing proof

Goal: prove the basic manual publishing lifecycle with one implicit GitHub destination.

- Manual PAT fallback for GitHub publishing
- Publish the current note to a configured repository, branch, and folder/path
- Confirmation modal with optional commit message override
- First publish creates the remote file
- Republish updates an existing remote file using the GitHub file SHA
- Manifest tracks local path, target path, published URL, remote SHA, local content hash, timestamp, and status
- Detect local changes after publish
- Handle rename/move/delete/modify events for tracked notes

### 0.1.1-alpha — Development diagnostics

Goal: make non-release builds self-identifying so desktop and mobile vault testing can verify exactly which build is running.

- Generate build metadata during the build from package and Git state
- Display version, branch, commit, build timestamp, dirty state, and relevant development defaults in a Developer settings section
- Include diagnostics only in non-release builds
- Keep production output limited to Obsidian runtime files
- Keep `manifest.json` and `package.json` versions aligned with meaningful development milestones

## 0.2.x — Connection foundation

Goal: replace developer-oriented setup with a professional connection model.

A connection represents access to a provider account or organization. It owns authentication/installation identity and exposes accessible repositories limited by granted permissions.

### 0.2.1 — GitHub App architecture plan

- Define official Squido GitHub App configuration
- Define setup/callback URL strategy for desktop and mobile Obsidian
- Define broker responsibilities and private credential boundaries
- Define GitHub App permissions
- Explain why GitHub App installation replaces Device Flow as the strategic public setup path

### 0.2.2 — Connection model and trust documentation

- Document Connection as separate from Destination
- Document manual PAT as Advanced fallback
- Document what GitHub can access after installation
- Document what Squido stores locally
- Document revocation, reconnect, and permission-loss behavior
- Add user-facing "How Squido connects to GitHub" language

### 0.2.3 — Repo access and picker planning

- Plan account/organization picker
- Plan installation-scoped repository picker
- Plan branch picker
- Plan folder/path picker
- Preserve current alpha manual destination settings during migration
- Avoid showing repositories outside granted GitHub App permissions

### 0.2.4 — Connection Integration

Goal: integrate the auth broker into Squido without changing publishing behavior.

This is the bridge between connection planning and destination-based publishing. It should prove the connection can drive the existing single-destination alpha publish flow before Squido introduces multiple destinations or a publishing router.

Acceptance criteria:

- Connect GitHub works
- Disconnect works
- Repository picker works from granted GitHub App access
- Branch picker works for the selected repository
- Folder picker works for the selected repository and branch
- Existing PAT users migrate cleanly into the new settings model
- Existing Publish current note button still works

Explicit non-goals:

- Multiple destinations
- Publishing router
- Lighthouse integration
- Import workflows
- Website workflows

## 0.3.x — Destination-Based Publishing MVP

Goal: make destinations explicit and support multiple GitHub publishing targets under one GitHub connection.

A destination belongs to a connection and contains saved publishing settings: repository, branch, folder/path, publish mode, optional URL pattern, and future metadata/schema settings.

- Destination data model
- Destination settings UI
- Destination picker in publish flow
- Multiple GitHub destinations under one GitHub connection
- File publish mode: create/update one remote file per source note
- Append publish mode: append source content to a configured remote file
- Example destinations:
  - Publication Log appends selected notes/entries to `/published/publication-log.md`
  - Articles publishes individual notes to `/published/articles/{{slug}}.md`
  - Documentation content publishes notes to a static-site Markdown content folder
- Per-note per-destination bindings
- Publish status per note per destination
- Post-publish URL handling
- Preserve current single-destination alpha behavior through migration
- Document the Obsidian editing surface + GitHub canonical published state model

### Rule planning

Goal: define how Squido suggests or selects destinations without silently publishing content.

A Rule suggests or auto-selects destinations based on note metadata or location. A Rule must not auto-publish unless the user explicitly enables auto-publish in a later automation milestone.

Rule inputs:

- Folder path
- Tag
- Frontmatter property
- Filename pattern
- Active Lighthouse Focus later, not now

## 0.4.x — Import and synchronization

Goal: import existing GitHub Markdown and begin explicit reconciliation workflows.

- GitHub Markdown browser
- Import selected Markdown files into Obsidian
- Duplicate detection
- Bind existing local notes to remote Markdown when explicitly chosen
- Update local note from remote when local state is clean
- Detect local/remote conflicts
- Document import/update/conflict workflows
- No automatic bidirectional sync until conflict handling is mature

## 0.5.x — Website workflows

Goal: make publishing workflows more useful for website-backed repositories without becoming a CMS.

- Website URL pattern/resolver support
- Open published page
- Unpublish or remove published file
- Validate remote files
- Detect stale remote state before publishing
- Dry-run publishing checks
- Optional automation planning with explicit warnings
- Rule-triggered auto-publish only when explicitly enabled by the user

## 0.6.x — Lighthouse integration hooks

Goal: expose Squido publish status and actions to Lighthouse without tight coupling.

- Public API/events for publish status data
- Do not require Lighthouse
- Do not reach into Lighthouse internals
- Leave room for Views/Bases-style integration
- Optional Lighthouse actions only after Squido's connection/destination model is stable

## 1.0.0 — Stable public release

Goal: ship a stable GitHub publishing bridge.

- Stable GitHub App connection flow
- Stable destination-based publishing model
- Stable import/update/conflict documentation
- Migration path from alpha PAT settings
- Release, compatibility, and recovery documentation

## Later destination publish modes

Later destination publish modes:

- Index/list generation
- PR mode
- Archive mode

## Later provider exploration

Additional providers require separate auth, permission, destination, and conflict-model assessment before implementation.

- GitLab
- Forgejo
- Gitea
- Ghost
- WordPress
- Other APIs only if worthwhile
