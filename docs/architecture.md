# Architecture

Squido's alpha architecture follows the publishing flow directly:

1. `main.ts` registers the command, ribbon action, settings, status bar, and vault event listeners.
2. `PublishModal` confirms the current note and collects a commit message.
3. `Publisher` reads the note, derives its destination, calls GitHub, and records a successful publish.
4. `GitHubClient` owns the GitHub Contents API request and update SHA lookup.
5. `SecureCredentialStore` stores provider credentials through secure local storage, not plaintext plugin data.
6. `ManifestStore` persists settings, encrypted credential records, and publish records through Obsidian plugin data.
7. `FileEventHandler` updates only already-tracked notes when vault paths or content change.
8. `PublishStatusService` compares the current content hash with the last successful publish hash.

## Lifecycle responsibilities

The alpha design distinguishes a first publish from an update:

- A first publish creates a GitHub file and stores both the returned file SHA and the hash of the local content that was sent.
- Status detection compares current local content with the stored local hash. It does not need a network request for routine local-change detection.
- A republish updates the existing remote file using the stored GitHub file SHA required by the GitHub Contents API.
- A successful republish replaces the stored GitHub SHA, local content hash, published URL when returned, timestamp, and status as one manifest update.
- Remote conflict detection is separate later work. The initial lifecycle assumes Squido's stored file SHA still identifies the remote version it last published and reports an API failure rather than silently overwriting on conflict.

Commit messages are a publishing detail, not a Git workflow exposed to the writer. The publisher chooses `Publish: {{title}}` or `Update: {{title}}` from lifecycle state and allows an explicit override from the confirmation UI.

These are small responsibility boundaries, not a general publishing framework. Future integrations should consume intentionally exposed APIs or events when those milestones arrive. They should not reach into internal stores or require Squido to know another plugin's implementation.

Provider integrations must follow the credential and authorization requirements in [provider-auth-requirements.md](provider-auth-requirements.md). Adding a provider is not just an API client task; each provider must document its auth model, scope granularity, secure-storage behavior, revocation path, and destination isolation.

## Non-goals

- Site generation or rendering
- Content modeling
- Vault navigation
- Moving or routing notes
- Automatic publishing
- Plaintext token storage
- Multiple destination abstraction before provider requirements are defined
- Remote conflict resolution
