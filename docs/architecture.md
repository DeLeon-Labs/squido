# Architecture

This file is the current docs index and module map. It should stay short. Detailed concepts live in the focused docs linked below.

For historical vNext planning context, see [rfc-squido-vnext-architecture.md](rfc-squido-vnext-architecture.md). That RFC is reference material, not the canonical source for current decisions.

## Current alpha module map

Squido's alpha implementation follows the publishing flow directly:

1. `main.ts` registers commands, ribbon action, settings, status bar, and vault event listeners.
2. `PublishModal` confirms the current note and collects a commit message.
3. `Publisher` reads the note, derives its destination, calls GitHub, and records a successful publish.
4. `GitHubClient` owns GitHub Contents API requests and update SHA lookup.
5. `ManifestStore` persists settings and publish records through Obsidian plugin data.
6. `FileEventHandler` updates already-tracked notes when vault paths or content change.
7. `PublishStatusService` compares current content hash with the last successful publish hash.

## Canonical docs

- [Authentication](authentication.md): GitHub App strategy, manual PAT fallback, broker boundary, credential storage, and auth milestones.
- [Security](security.md): concise security checklist and trust boundaries.
- [Publishing lifecycle](publishing-lifecycle.md): first publish, local edits, republish, and automation boundary.
- [Publish manifest](publish-manifest.md): current alpha manifest and vNext manifest planning.
- [Connections and destinations](destinations.md): Connection, Destination, Rule, and destination-based publishing model.
- [GitHub import workflow](github-import-workflow.md): planned Markdown import, duplicate detection, update, and conflict workflows.
- [Roadmap](../ROADMAP.md): milestone sequence and implementation boundaries.

## Development diagnostics

Non-release builds include a Developer settings section driven by generated `dist/build-info.json`. Production builds omit that file and should remain limited to Obsidian runtime files: `main.js`, `manifest.json`, and `styles.css`.

## Non-goals

- Site generation or rendering
- Content modeling
- Vault navigation
- Moving or routing notes
- Automatic publishing by default
- Device Flow as the strategic public auth path
- Broker-mediated note content publishing
- Remote conflict resolution in the alpha
