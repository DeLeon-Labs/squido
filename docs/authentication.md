# Authentication

Squido's strategic public authentication path is GitHub App installation. Manual personal access token (PAT) publishing remains available as an explicit **Advanced** fallback.

The canonical architecture—including ownership, the five-layer lifecycle, credential safety, Cloudflare storage, token scope, failure behavior, content boundaries, and implementation status—is [GitHub App authentication architecture](github-app-auth-architecture.md). This document focuses on the user-facing flow and Squido's local storage posture.

## Default hosted setup

Normal users use the DeLeon Labs hosted auth broker and DeLeon Labs-owned Squido GitHub App. They do not need to create a GitHub App, deploy a broker, configure Cloudflare, or provide GitHub App IDs, private keys, OAuth client credentials, or broker secrets.

GitHub owns installation and repository access. Squido owns repository selection and publishing decisions. The broker owns authentication metadata and private GitHub App credentials, and remains content-blind.

## User-facing lifecycle

1. Select **Connect GitHub** for the first bootstrap/install flow.
2. Choose the GitHub account or organization and grant repository access in GitHub.
3. Return to Obsidian while Squido polls the broker for completion.
4. Use **Verify Connection** to check an existing broker session without reopening GitHub.
5. Use **Manage GitHub Access** to change repository permissions in GitHub.
6. Use **Reauthorize This Device** if the GitHub App remains installed but this local device/session is disconnected.
7. Use **Disconnect This Device** to revoke this local session without uninstalling the GitHub App.

GitHub App setup redirects are for first setup and permission changes. They are not the normal reconnect mechanism. Polling is the primary return path because it works on desktop and mobile; an Obsidian deep link is optional convenience only.

## Connection is not destination

A connection represents provider account/organization and installation identity. It exposes only repositories allowed by the GitHub App installation.

A destination belongs to a connection and records where content should publish: repository, branch, folder/path, publish mode, and related settings. Authentication does not make a publishing decision. See [Connections and destinations](destinations.md).

## Current state

Implemented across Squido and the broker:

- setup/callback and broker polling;
- persistent connection metadata and broker-session verification;
- recognized device/session binding;
- broker-grant hashing, expiration, revocation, and rotation;
- **Manage GitHub Access**;
- device reauthorization through GitHub OAuth;
- broker-side metadata-only token vending for `repo_discovery`.

Not yet implemented in Squido:

- calling the token endpoint and storing a rotated grant from that exchange;
- direct repository discovery and repository picker;
- branch and folder pickers;
- GitHub App publishing or write-scoped token vending;
- destination migration.

The active hardening and delivery sequence is maintained in [ROADMAP.md](../ROADMAP.md).

## Local credential storage

Squido stores non-sensitive installation/account metadata in plugin data. It also stores the current broker grant through `PluginDataCredentialStore` because Obsidian does not currently expose universal secure cross-platform credential storage to community plugins.

The broker grant is not a GitHub token, but it is sensitive reusable session material. Plugin data is not OS secure storage. Users should protect the vault, synced configuration, backups, and the plugin's `data.json`.

The architecture limits this risk with broker-side grant hashing, device binding, expiration, revocation, and rotation. GitHub installation tokens are short-lived, used in memory only, and never persisted by Squido or the broker.

The accepted storage decision is [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md), supported by [Secure credential storage investigation](credential-storage-investigation.md). Future OS-backed storage or Squido Connect could replace the local storage backend without changing the authentication lifecycle.

## Manual PAT fallback

Manual PAT publishing remains under **Advanced** for current users, local testing, and recovery. It is deliberately separate from the GitHub App flow and is not an automatic fallback.

The PAT is stored in Obsidian plugin data. Use a fine-grained token restricted to the intended destination repository with only the Contents permission required to write files. Manual PAT mode does not provide the same selected-repository installation and short-lived-token model as the GitHub App path.

## Self-hosting boundary

The public architecture describes storage classes, trust boundaries, permissions, credential lifetimes, rotation/revocation guarantees, content-blindness, and high-level failure behavior. A future self-hosting guide may document supported deployment configuration separately.

Public docs do not include production secrets or IDs, undocumented production endpoints, internal coordination key formats, exact protection timing values, sensitive logs, operational recovery commands, or exploit reproduction instructions.

## Related decisions

- [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md)
- [ADR-0002: Authentication lifecycle](decisions/ADR-0002-authentication-lifecycle.md)
- [Security checklist](security.md)
