# ADR-0002: Authentication lifecycle

Status: Accepted

Date: 2026-07-04

## Context

The GitHub App Connection MVP proved that Squido can start a broker-backed GitHub App setup flow, receive installation metadata, and verify a broker session from Obsidian. It also exposed an important lifecycle distinction: GitHub App install and update redirects are useful for first setup and permission changes, but they are not the normal reconnect mechanism.

Squido needs an authentication model that stays clear about ownership:

- Squido owns publishing.
- GitHub owns repository permissions.
- The auth broker owns authentication metadata only.
- The broker is intentionally content-blind.
- Squido should communicate directly with GitHub whenever practical using short-lived installation tokens obtained from the broker.

Authentication should balance strong security with an excellent user experience. Security is layered rather than absolute. Squido should use the strongest security architecture reasonably available within the capabilities of the host platform, while documenting platform limitations honestly.

## Decision

Squido authentication is modeled as five conceptual layers.

### 1. GitHub App installation

Owner: GitHub.

Lifetime: long-lived until the user or organization removes the GitHub App installation or changes its access.

Responsibility: grants Squido selected-repository access through GitHub's installation permissions model.

Why it exists: GitHub is the source of truth for which repositories Squido may access. Squido should not try to duplicate or override GitHub's permission model.

### 2. Persistent connection

Owner: auth broker.

Lifetime: long-lived and revocable.

Responsibility: records authentication metadata tying a provider installation/account to Squido. For GitHub, this includes provider, connection id, GitHub installation id, account login/id/type, permission metadata, and status.

Why it exists: Squido needs a durable provider relationship that is separate from transient browser setup flows and local Obsidian UI state.

### 3. Recognized device

Owner: auth broker, with local Squido metadata.

Lifetime: long-lived and revocable.

Responsibility: identifies a device or plugin installation that is allowed to use a persistent connection. A device id supports audit, revocation, and session management. It is not magic security if stored beside a broker grant.

Why it exists: devices should be independently revocable and observable without requiring the user to remove the entire GitHub App installation.

### 4. Broker session

Owner: auth broker, with the current grant stored by Squido.

Lifetime: medium-lived, revocable, and rotatable.

Responsibility: lets a recognized device verify an existing connection without reopening GitHub. Broker sessions should rotate over time and should be revocable independently of the underlying GitHub App installation.

Why it exists: normal reconnect should not depend on GitHub App setup redirects or require users to change repository access.

### 5. Short-lived GitHub installation token

Owner: GitHub, minted through broker-side GitHub App credentials when needed.

Lifetime: short-lived.

Responsibility: authorizes specific GitHub API operations such as future repository discovery or publishing.

Why it exists: Squido should not store long-lived GitHub credentials. When Squido needs GitHub access, it should obtain short-lived authorization and then call GitHub directly.

## Current implementation stance

Obsidian does not currently expose secure cross-platform credential storage to community plugins. Squido therefore stores broker session/grant information in Obsidian plugin data through its current `CredentialStore` implementation.

This is not merely an alpha workaround. It is the current reference implementation and the best known plugin-only architecture available under today's Obsidian plugin API constraints.

The architecture reduces risk through layers:

- broker sessions are revocable;
- broker sessions are rotatable;
- GitHub installation tokens are never persisted by Squido;
- GitHub App private keys never leave the broker;
- the broker never stores user content;
- the broker stores authentication metadata only.

This storage backend may change if a better platform capability becomes available. Future possibilities include native platform secure storage, a Squido Connect native service, or another platform credential provider. The authentication lifecycle should not depend on those future capabilities existing.

## Responsibility boundaries

### GitHub

- Owns GitHub App installation.
- Owns repository permissions.
- Owns short-lived installation tokens.
- Owns repository access settings.

### Auth broker

- Stores authentication metadata.
- Tracks persistent connections.
- Tracks recognized devices.
- Manages broker sessions and grants.
- Mints or brokers short-lived installation tokens in a future milestone.
- Never stores or proxies user content.

Allowed broker data:

- connection id;
- provider;
- GitHub installation id;
- GitHub account login/id/type;
- device id;
- session/grant hashes;
- created/updated/last-verified timestamps;
- revoked, expired, or suspended status;
- provider permission metadata.

Forbidden broker data:

- note content;
- vault paths;
- destination rules;
- publish manifests;
- repository file contents;
- Lighthouse state;
- publishing decisions;
- local Obsidian file metadata.

### Squido

- Owns local state and UI.
- Owns publishing decisions.
- Owns destination selection and publish workflows.
- Owns direct GitHub communication using broker-issued short-lived tokens.
- Stores broker session/grant information locally through the current `CredentialStore`.

## Authentication flows

### First setup

The user chooses **Connect GitHub**. Squido starts a broker setup flow. The broker sends the browser to GitHub App installation or configuration. GitHub returns installation metadata to the broker. The broker creates or updates the persistent connection, recognizes the current device, creates a broker session, and returns connection metadata to Squido through polling.

### Normal reconnect

Squido verifies the existing broker session with the broker. The broker checks the session, device, and persistent connection, rotates the grant when appropriate, and returns current connection metadata. GitHub browser setup is not involved.

### Session refresh

Squido periodically or manually verifies the broker session. A successful refresh keeps the user connected and may replace the local broker grant. An expired or revoked session asks the user to reconnect or repair the device session.

### Future additional device

Additional devices should eventually be approved through device linking, a QR/code flow, or fallback GitHub verification. The design should allow a new recognized device without forcing the user to remove and reinstall the GitHub App.

### Manage GitHub Access

The user chooses **Manage GitHub Access**. Squido opens GitHub's installation settings for the connected account/organization. Changing repository access is a permissions-management action, not a reconnect action.

### Future Refresh Repositories

After changing GitHub App repository access, the user chooses **Refresh Repositories**. Squido refreshes available repositories using broker-authorized short-lived GitHub access. This does not reset the persistent connection or recognized device.

### Revoked installation

If GitHub reports that the installation was removed or access is no longer valid, Squido should show that the GitHub App installation needs attention and offer **Reconnect GitHub**.

### Session expiration

If the broker session expires, Squido should show a session-expired state and offer a session/device repair path. It should not treat this as a GitHub repository-permission change.

### Device revocation

If a device is revoked, Squido should clear its local broker session and show that this device is no longer recognized. The persistent connection may still exist for other devices.

## Security philosophy

Squido does not claim impossible security guarantees. Instead, it minimizes risk by:

- minimizing stored secrets;
- minimizing broker responsibility;
- using short-lived credentials whenever practical;
- separating authentication from publishing;
- keeping the broker content-blind;
- documenting host-platform limitations honestly;
- making future storage backends possible without changing the authentication lifecycle.

## Summary table

| Concept | Owner | Lifetime | Stores |
| --- | --- | --- | --- |
| GitHub App installation | GitHub | Long-lived until removed or changed | installation id, repository permissions, installation settings |
| Connection | Broker | Long-lived and revocable | provider, connection id, installation id, account metadata, permission metadata, status timestamps |
| Device | Broker and Squido | Long-lived and revocable | device id, connection id, status, timestamps |
| Session | Broker and Squido | Medium-lived, revocable, rotatable | grant hash on broker, broker grant in Squido `CredentialStore`, expiration and verification timestamps |
| GitHub installation token | GitHub, minted via broker | Short-lived | token and expiry in memory only; never persisted by Squido |
| Publish operation | Squido | Per user action | source note content locally, destination choice, GitHub API request, publish result in Squido manifest |

## Future roadmap fit

This lifecycle supports the existing `CredentialStore` abstraction because local grant storage is isolated behind a storage boundary. If native platform secure storage, Squido Connect, or another credential provider becomes available, it can replace the storage backend without changing the authentication model.

It supports token vending because the broker can mint short-lived GitHub installation tokens for a verified connection and recognized device without receiving note content.

It supports repo, branch, and folder pickers because Squido can request short-lived GitHub authorization and then query GitHub directly.

It supports additional publishing providers because connection, device, session, grant, and token request are provider-neutral concepts. Provider-specific installation and token logic should live behind provider-specific broker modules.

## Consequences

- GitHub setup/bootstrap is not the normal reconnect path.
- GitHub repository access management is separate from Squido session verification.
- The broker remains content-blind even when token vending is added later.
- Current plugin-data session/grant storage remains the reference plugin-only implementation unless a stronger host-platform capability becomes available.
- Implementation should keep route handlers and storage models aligned with connection, device, session, token, and provider boundaries.
