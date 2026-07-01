# Security

This is the short Squido security checklist. Detailed auth flow planning lives in [authentication.md](authentication.md). Canonical broker trust decisions live in the [squido-auth-broker ADR index](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions.md).

## Current alpha

- Squido sends note content only to the configured GitHub API destination.
- The manual PAT fallback stores its token in Obsidian plugin data because Obsidian does not provide a universal plugin secrets store.
- Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files.
- Do not share or commit Squido `data.json`.
- Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

## Strategic GitHub App path

- GitHub App auth is the strategic path because users and organizations can grant selected-repository access.
- GitHub App private keys and broker signing secrets must never be bundled into the Obsidian plugin.
- The auth broker is infrastructure, not a publishing service. See broker [ADR-0001](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions/ADR-0001-auth-broker-does-not-handle-note-content.md).
- Squido should publish directly to GitHub after obtaining short-lived authorization. User-authored content should not be proxied through the broker.
- Persistent GitHub App login requires secure local storage for sensitive credential material. See broker [ADR-0003](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions/ADR-0003-secure-storage-required-for-persistent-login.md).
- If secure storage is unavailable, Squido must not silently fall back to plaintext plugin data for persistent GitHub App login.

## Publishing safety

- Before each publish or republish, Squido presents a confirmation modal and an editable generated message.
- Squido does not auto-publish, publish folders, or send note content to any service other than the configured GitHub API endpoint in the alpha.
- Future Rules may suggest or select destinations, but they must not auto-publish unless the user explicitly enables that later behavior.
- Optional auto-republish is later work and must require explicit warnings and granular controls.
