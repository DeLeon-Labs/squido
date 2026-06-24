# Architecture

Squido's alpha architecture follows the publishing flow directly:

1. `main.ts` registers the command, ribbon action, settings, status bar, and vault event listeners.
2. `PublishModal` confirms the current note and collects a commit message.
3. `Publisher` reads the note, derives its destination, calls GitHub, and records a successful publish.
4. `GitHubClient` owns the GitHub Contents API request and update SHA lookup.
5. `ManifestStore` persists settings and publish records through Obsidian plugin data.
6. `FileEventHandler` updates only already-tracked notes when vault paths or content change.
7. `PublishStatusService` compares the current content hash with the last successful publish hash.

These are small responsibility boundaries, not a general publishing framework. Future integrations should consume intentionally exposed APIs or events when those milestones arrive. They should not reach into internal stores or require Squido to know another plugin's implementation.

## Non-goals

- Site generation or rendering
- Content modeling
- Vault navigation
- Moving or routing notes
- Automatic publishing
- Multiple destination abstraction
- Remote conflict resolution

