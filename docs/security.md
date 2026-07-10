# Security

This is the short Squido security checklist. Detailed auth flow planning lives in [authentication.md](authentication.md). Canonical broker trust decisions live in the [squido-auth-broker ADR index](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions.md).

## Current alpha

- Squido sends note content only to the configured GitHub API destination.
- The manual PAT fallback stores its token in Obsidian plugin data because Obsidian does not provide a universal plugin secrets store.
- Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files.
- Broker grants are stored through Squido's plugin-data `CredentialStore` because Obsidian does not currently expose secure cross-platform credential storage to community plugins. This is the current reference plugin-only implementation, not OS secure storage.
- Broker sessions remain revocable and rotatable. Squido sends a generated `device_session_id` with broker start, verification, and revocation requests.
- Do not share or commit Squido `data.json`.
- Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

## Strategic GitHub App path

- GitHub App auth is the strategic path because users and organizations can grant selected-repository access.
- Default users use the DeLeon Labs hosted auth broker and DeLeon Labs-owned GitHub App; they do not configure GitHub App secrets, Wrangler vars, Cloudflare Workers, or broker deployment.
- GitHub App private keys and broker signing secrets must never be bundled into the Obsidian plugin.
- The auth broker is infrastructure, not a publishing service. See broker [ADR-0001](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions/ADR-0001-auth-broker-does-not-handle-note-content.md).
- Squido should publish directly to GitHub after obtaining short-lived authorization. User-authored content should not be proxied through the broker.
- Persistent GitHub App login should use the strongest storage backend reasonably available to the plugin. Today, Squido's reference plugin-only backend is plugin data plus broker-side revocation and rotation.
- Squido must not describe plugin-data storage as OS secure storage.
- Squido's accepted local storage direction is [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md). The supporting research is in [Secure credential storage investigation](credential-storage-investigation.md).
- The accepted lifecycle model is [ADR-0002: Authentication lifecycle](decisions/ADR-0002-authentication-lifecycle.md).
- GitHub installation tokens must remain short-lived and must never be persisted by Squido.
- Broker-grant hardening should happen before token vending: generated device/session identifiers, revocation, expiration, and grant rotation reduce the risk of plaintext alpha storage without claiming secure persistence.

## Publishing safety

- Before each publish or republish, Squido presents a confirmation modal and an editable generated message.
- Squido does not auto-publish, publish folders, or send note content to any service other than the configured GitHub API endpoint in the alpha.
- Future Rules may suggest or select destinations, but they must not auto-publish unless the user explicitly enables that later behavior.
- Optional auto-republish is later work and must require explicit warnings and granular controls.
