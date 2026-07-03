# Architecture

This file is the current docs index and module map. It should stay short. Detailed concepts live in the focused docs linked below.

For historical vNext planning context, see [rfc-squido-vnext-architecture.md](rfc-squido-vnext-architecture.md). That RFC is reference material, not the canonical source for current decisions.

## Current alpha module map

Squido's alpha implementation follows the publishing flow directly:

1. `main.ts` owns plugin lifecycle and orchestration: service construction, command/ribbon registration, settings tab registration, status refresh, and vault event wiring.
2. `auth/GitHubConnectionController` owns GitHub App connection state, broker polling, stored broker-grant verification, pending recovery, and disconnect behavior.
3. `auth/BrokerAuthClient` owns broker HTTP requests and response normalization.
4. `credentials/PluginDataCredentialStore` is the current cross-platform credential-store seam. It stores the broker grant through existing plugin data and keeps the future storage backend swap isolated.
5. `settings/` owns Settings UI sections for GitHub App connection, manual PAT publishing, and Developer diagnostics.
6. `diagnostics/buildInfo.ts` owns generated build-info loading for non-release Developer diagnostics.
7. `PublishModal` confirms the current note and collects a commit message.
8. `Publisher` reads the note, derives its destination, calls GitHub, and records a successful publish.
9. `GitHubClient` owns GitHub Contents API requests and update SHA lookup.
10. `storage/ManifestStore` persists settings and publish records through Obsidian plugin data.
11. `FileEventHandler` updates already-tracked notes when vault paths or content change.
12. `PublishStatusService` compares current content hash with the last successful publish hash.

## Canonical docs

- [Authentication](authentication.md): GitHub App strategy, manual PAT fallback, broker boundary, credential storage, and auth milestones.
- [Security](security.md): concise security checklist and trust boundaries.
- [Architecture decisions](decisions.md): accepted Squido-side ADR index.
- [Secure credential storage investigation](credential-storage-investigation.md): platform research, threat model, options, and storage recommendation before token vending.
- [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md): accepted direction for broker grants and future authentication material.
- [Publishing lifecycle](publishing-lifecycle.md): first publish, local edits, republish, and automation boundary.
- [Publish manifest](publish-manifest.md): current alpha manifest and vNext manifest planning.
- [Connections and destinations](destinations.md): Connection, Destination, Rule, and destination-based publishing model.
- [GitHub import workflow](github-import-workflow.md): planned Markdown import, duplicate detection, update, and conflict workflows.
- [Squido Connect Local Agent RFC](rfc-squido-connect-local-agent.md): future Mac-first local auth agent concept for secure provider authentication.
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
