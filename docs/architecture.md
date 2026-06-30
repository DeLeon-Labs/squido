# Architecture

For the vNext architecture proposal, see [rfc-squido-vnext-architecture.md](rfc-squido-vnext-architecture.md).

Squido's alpha architecture follows the publishing flow directly:

1. `main.ts` registers the command, ribbon action, settings, status bar, and vault event listeners.
2. `PublishModal` confirms the current note and collects a commit message.
3. `Publisher` reads the note, derives its destination, calls GitHub, and records a successful publish.
4. `GitHubClient` owns the GitHub Contents API request and update SHA lookup.
5. `ManifestStore` persists settings and publish records through Obsidian plugin data.
6. `FileEventHandler` updates only already-tracked notes when vault paths or content change.
7. `PublishStatusService` compares the current content hash with the last successful publish hash.

## Lifecycle responsibilities

The alpha design distinguishes a first publish from an update:

- A first publish creates a GitHub file and stores both the returned file SHA and the hash of the local content that was sent.
- Status detection compares current local content with the stored local hash. It does not need a network request for routine local-change detection.
- A republish updates the existing remote file using the stored GitHub file SHA required by the GitHub Contents API.
- A successful republish replaces the stored GitHub SHA, local content hash, published URL when returned, timestamp, and status as one manifest update.
- Remote conflict detection is separate later work. The initial lifecycle assumes Squido's stored file SHA still identifies the remote version it last published and reports an API failure rather than silently overwriting on conflict.

Commit messages are a publishing detail, not a Git workflow exposed to the writer. The publisher chooses `Publish: {{title}}` or `Update: {{title}}` from lifecycle state and allows an explicit override from the confirmation UI.

These are small responsibility boundaries, not a general publishing framework. Future integrations should consume intentionally exposed APIs or events when those milestones arrive. They should not reach into internal stores or require Squido to know another plugin's implementation.

## Authentication direction

GitHub App installation is the planned authentication foundation before destination-based publishing. The callback/setup flow must be designed before auth implementation. See [authentication.md](authentication.md) for the planned product-controlled HTTPS callback, broker session, optional Obsidian deep-link, and plugin polling strategy.

The auth broker should manage GitHub App private-key operations and short-lived installation-token exchange. It should not proxy or store note content; Squido should publish directly to GitHub after receiving an installation token.

The first implementation step after planning is Connection Integration: connect/disconnect GitHub, repository/branch/folder pickers, migration for existing PAT settings, and the existing publish button. It should not introduce multiple destinations, a publishing router, import, Lighthouse integration, or website workflows.

## Destination direction

Squido is a content synchronization and publishing bridge. Obsidian is the editing surface, GitHub is the first canonical published-content backend, and destinations describe saved publish/import targets. See [destinations.md](destinations.md) for the planned connection/destination model and Destination-Based Publishing MVP.

## Non-goals

- Site generation or rendering
- Content modeling
- Vault navigation
- Moving or routing notes
- Automatic publishing
- Device Flow as the strategic auth direction
- Implementing destination-based publishing before the connection model is accepted
- Remote conflict resolution
