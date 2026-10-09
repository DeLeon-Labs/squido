# ADR-0002: Authentication lifecycle

Status: Accepted

Date: 2026-07-04

## Context

The GitHub App Connection MVP proved setup, callback, polling, and broker-session verification. It also showed that GitHub installation/update redirects are useful for first setup and repository-permission changes but are not a reliable normal reconnect mechanism.

Squido needs a lifecycle that separates GitHub's long-lived installation, the broker's persistent account relationship, local device recognition, a revocable broker session, and short-lived GitHub authorization. The model must preserve a content-blind broker and remain valid if Squido later changes its local credential-storage backend.

## Decision

Squido accepts five distinct authentication layers:

1. **GitHub App installation** — owned by GitHub; long-lived until removed or changed; source of truth for account/organization and repository permissions.
2. **Persistent connection** — owned by the broker; long-lived and revocable; records provider installation/account metadata independently of browser flows and local UI state.
3. **Recognized device** — tracked by the broker and identified locally by Squido; independently revocable; provides per-plugin-installation audit and session control.
4. **Broker session** — owned by the broker with its current grant stored by Squido; expiring, revocable, and rotatable; verifies an existing connection without reopening GitHub.
5. **Short-lived GitHub installation token** — owned by GitHub and requested through broker-held GitHub App credentials; authorizes a separately reviewed class of direct GitHub API calls.

GitHub setup/bootstrap is not the normal reconnect path. **Verify Connection** checks the broker session. **Manage GitHub Access** changes GitHub repository permissions. **Reauthorize This Device** repairs a local device/session. **Disconnect This Device** revokes the local session without uninstalling the GitHub App.

Squido owns UI, repository and destination selection, publishing decisions, content, manifests, and direct GitHub API calls. The broker owns authentication metadata, private GitHub App credentials, sessions, and token vending. The broker never receives publishing content or state.

The complete normative architecture and current implementation status now live in [GitHub App authentication architecture](../github-app-auth-architecture.md). That document is the cross-repository source of truth; this ADR records why the lifecycle was accepted.

## Consequences

- Repository access management and broker-session verification are separate operations.
- Devices and broker sessions can be revoked without removing the GitHub App for every device.
- Broker grants remain sensitive even though they are not GitHub tokens.
- The current plugin-data `CredentialStore` is not OS secure storage, but it can be replaced without changing the lifecycle.
- Short-lived installation tokens are used in memory and never persisted by Squido or the broker.
- The broker remains content-blind when vending tokens.
- Token purposes and permissions are fixed by reviewed broker contracts, not client input.
- Cloudflare KV stores authentication state but cannot safely serialize token vending; strongly coordinated token vending uses a SQLite-backed Durable Object.
- GitHub token creation and broker state changes cannot be one cross-system atomic transaction, so uncertain outcomes fail closed.

## Current implementation outcome

The setup/callback flow, polling, persistent connection metadata, broker-session verification, device/session binding, broker-grant hashing/expiration/revocation/rotation, GitHub access management, device reauthorization, and metadata-only `repo_discovery` token vending are implemented across Squido and the broker.

Squido-side token-endpoint integration, repository discovery, picker flows, GitHub App publishing, write-scoped tokens, and destination migration remain roadmap work. Manual PAT publishing remains an explicit **Advanced** fallback.

## Remaining decision

Additional-device pairing remains open. Future options may include existing-device approval, a short code or QR flow, or broker-mediated GitHub verification. It is not required for the next repository-discovery milestone.

## Related decisions

- [ADR-0001: Secure credential storage strategy](ADR-0001-secure-credential-storage.md)
- [GitHub App authentication architecture](../github-app-auth-architecture.md)
- [Authentication](../authentication.md)
