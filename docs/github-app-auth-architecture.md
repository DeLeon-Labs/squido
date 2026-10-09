# GitHub App authentication architecture

This document is the canonical public source of truth for Squido's GitHub App authentication architecture. It covers the public Squido plugin and the private DeLeon Labs auth broker without exposing production secrets, internal coordination identifiers, recovery procedures, or exploit-enabling implementation details.

Audience: Squido users, contributors, security reviewers, DeLeon Labs operators, and future self-hosting evaluators.

Manual personal access token (PAT) publishing remains available as an explicit **Advanced** fallback. The GitHub App path does not yet replace or remove it.

## Ownership and trust boundaries

### GitHub

GitHub owns:

- GitHub App installation and removal;
- account or organization selection;
- repository access selection;
- repository permissions;
- creation and expiration of short-lived installation tokens.

GitHub is the source of truth for which repositories an installation can access. Neither Squido nor the broker may broaden that access.

### Squido

The Squido plugin owns:

- connection and publishing UI;
- repository, branch, folder, and destination selection;
- publishing decisions and user confirmation;
- note content and vault paths;
- destinations, bindings, and publish manifests;
- direct GitHub API calls made with short-lived authorization.

Squido does not send publishing content or publishing state through the auth broker.

### DeLeon Labs hosted auth broker

The hosted broker owns:

- authentication flow metadata;
- persistent GitHub App connection metadata;
- recognized device and broker session records;
- GitHub App private credentials and broker secrets;
- short-lived GitHub installation-token vending.

The broker is content-blind. It is authentication infrastructure, not a publishing proxy, content service, destination manager, or system of record for a vault.

## Authentication lifecycle

The lifecycle has five distinct layers. Removing or repairing one layer does not automatically remove the others.

| Layer | Owner | Typical lifetime | Purpose |
| --- | --- | --- | --- |
| GitHub App installation | GitHub | Long-lived until removed or changed | Defines account/organization ownership and repository permissions. |
| Persistent connection | Broker | Long-lived and revocable | Associates Squido with installation and account metadata independently of a browser flow. |
| Recognized device | Broker, identified locally by Squido | Long-lived and independently revocable | Identifies a particular plugin installation that may use the connection. |
| Broker session | Broker, with its grant held by Squido | Expiring, revocable, and rotatable | Lets a recognized device verify and use the connection without reopening GitHub. |
| GitHub installation token | GitHub, requested through the broker | Short-lived | Authorizes one reviewed class of direct GitHub API operations. It is used in memory and is not persisted. |

A broker grant is not a GitHub token, but it remains sensitive reusable session material. Obsidian does not currently provide universal OS-backed credential storage to community plugins, so Squido's reference plugin-only implementation stores the current grant through its plugin-data `CredentialStore`. This is not OS secure storage. Broker-side hashing, expiration, revocation, device binding, and rotation reduce risk but do not make local plugin data a secure enclave.

## User actions

The Settings actions have deliberately separate meanings:

- **Connect GitHub** starts the first bootstrap and GitHub App install/setup flow. It creates the initial persistent connection, recognized device, and broker session after GitHub completes the installation callback.
- **Verify Connection** verifies the existing broker session and connection. It does not reopen GitHub or change repository permissions. A successful response may rotate the broker grant, which Squido must replace locally.
- **Reauthorize This Device** repairs a disconnected or unrecognized local device through broker-mediated GitHub OAuth verification. It does not require reinstalling the GitHub App or changing repository access.
- **Manage GitHub Access** opens GitHub's installation settings so the user or organization administrator can add or remove repository access. It is permission management, not broker-session repair.
- **Disconnect This Device** revokes or clears the current local device/session. It does not uninstall the GitHub App, delete the persistent connection for other devices, or change GitHub repository permissions.

## Flow overview

### Initial connection

1. Squido asks the broker to start a short-lived setup flow for the local device.
2. The user installs or configures the Squido GitHub App on GitHub.
3. GitHub returns the setup result to the broker-controlled callback.
4. The broker validates the flow and records installation, connection, device, and session metadata.
5. Squido polls the broker and receives non-sensitive connection metadata plus a sensitive broker grant.

The polling-first design works on desktop and mobile without depending on an Obsidian deep link.

### Existing connection

Squido verifies the stored broker grant and device identifier with the broker. The broker verifies the session, device, connection, and installation state, then returns current connection metadata and may rotate the grant. GitHub's installation page is not the normal reconnect mechanism.

### Short-lived GitHub access

For an implemented, reviewed purpose, Squido presents its broker session and device identity to the broker. The broker validates the fixed purpose and authenticated connection, coordinates the token-vending attempt, and asks GitHub to mint a narrowly permissioned installation token. Squido then calls GitHub directly. The broker does not receive the GitHub API request body or response content from Squido.

## Current implementation state

### Implemented across Squido and the broker

- GitHub App setup and callback flow;
- broker polling from Squido;
- persistent connection metadata;
- broker session verification;
- device/session binding;
- broker-grant hashing, expiration, revocation, and rotation;
- **Manage GitHub Access** handling;
- device reauthorization through GitHub OAuth;
- metadata-only installation-token vending for the fixed `repo_discovery` purpose.

### Current security hardening

- enforce `Cache-Control: no-store` on every credential-bearing response;
- serialize token vending with a SQLite-backed Durable Object;
- test concurrent replay attempts;
- recover conservatively from stale reservations;
- fail closed when token creation or coordination state is uncertain.

### Not yet implemented in Squido

- calling the installation-token endpoint;
- replacing the broker grant returned by token exchange;
- direct GitHub repository discovery;
- repository picker;
- branch picker;
- folder picker;
- GitHub App publishing;
- write-scoped token vending;
- destination migration from the current alpha settings.

Manual PAT publishing remains the working **Advanced** fallback while these items are incomplete.

## Credential response safety

The following are architecture invariants, including during error and recovery paths:

- Any response containing GitHub tokens, broker grants, rotated grants, authorization codes, or other reusable credential material uses `Cache-Control: no-store`.
- Credentials and reusable authorization material are never logged. Logs use non-secret identifiers and sanitized error metadata only.
- GitHub installation tokens are never persisted by the broker or Squido.
- Broker grants remain sensitive session artifacts even though they are not GitHub tokens.
- GitHub App private keys, broker signing secrets, and provider client secrets never ship in the Obsidian plugin.

The current hardening work is closing implementation gaps against these invariants. An invariant describes the required architecture; it must not be read as evidence that every historical response path already complied.

## Cloudflare storage architecture

The canonical broker storage split separates durable authentication state from strongly coordinated token-vending work.

### Cloudflare KV

KV stores authentication records and flow state:

- setup and device-repair flow state;
- persistent connection metadata;
- recognized device records;
- broker session records;
- hashed grant material;
- expiration and revocation metadata.

KV contains authentication metadata, not GitHub tokens or Squido content.

### SQLite-backed Durable Object

A Durable Object coordinates token vending only:

- one logical coordinator is used for a trusted broker session or connection;
- concurrent token-vending attempts are serialized;
- duplicate token minting from the same broker session is prevented;
- only the minimal reservation and outcome metadata needed for coordination is stored.

The Durable Object never stores GitHub tokens, repository contents, note content, vault paths, manifests, destinations, bindings, Lighthouse state, or publishing state.

## Consistency and failure model

Cloudflare KV is eventually consistent and is not used as a distributed lock. A read followed by a write in KV cannot safely guarantee that two broker instances will not both act on the same session.

SQLite-backed Durable Objects provide the strongly coordinated serialization boundary for token vending. They make concurrent decisions ordered within one logical coordinator, but they cannot create a single atomic transaction spanning Cloudflare state and GitHub's token-creation API.

That cross-system limitation means an interrupted request can leave the broker uncertain whether GitHub created a token. Uncertain outcomes are handled conservatively and fail closed; the architecture prefers a user retry or explicit recovery state over silently minting another token or accepting replay.

Public documentation intentionally omits internal lock-key formats, production object identifiers, exact reservation timeouts, bypass details, sensitive logs, and operational recovery commands.

## Token purpose and permission scope

The only implemented token purpose is `repo_discovery`.

For that purpose:

- the GitHub installation-token request is fixed to `metadata: read`;
- the client cannot request arbitrary permissions;
- the client cannot choose an arbitrary installation ID;
- the client cannot choose repository IDs or broaden repository access;
- the broker derives trusted installation context from the verified connection and broker session.

Repository visibility remains bounded by the GitHub App installation. Any future read purpose, write purpose, or publishing token requires a separate reviewed milestone with an explicit permission contract, threat review, tests, and documentation update.

## Content boundary

The broker must never receive or store:

- note content;
- vault paths;
- repository file contents;
- publishing manifests;
- destinations;
- bindings;
- publishing decisions;
- Lighthouse state.

Squido sends content directly to GitHub only after the user makes a publishing decision and Squido holds appropriate short-lived authorization. The broker remains outside that data path.

## Revocation, rotation, and limitations

- Removing the GitHub App or repository permission in GitHub removes the underlying access regardless of local Squido state.
- Revoking a recognized device or broker session prevents that local session from being used after broker verification.
- Successful session verification or token exchange may rotate the broker grant; the old grant is then invalid and Squido must persist the replacement.
- A device identifier stored beside a broker grant improves audit and revocation granularity but is not an independent secret.
- Plugin-data credential storage can be copied through backups or vault synchronization. Users must protect `data.json` and treat it as sensitive.
- The broker's content-blind design limits what a broker compromise can expose, but compromise of broker signing material or GitHub App credentials remains a serious infrastructure event.
- Cross-system token creation cannot be made perfectly atomic; the design mitigates this with serialization and fail-closed handling.

## Roadmap boundary

The active sequence is maintained in [ROADMAP.md](../ROADMAP.md):

- completed: connection lifecycle, device/session hardening, device repair, and metadata-only token-endpoint implementation;
- current hardening: no-store credential responses, Durable Object serialization, concurrent replay tests, stale-reservation recovery, and fail-closed uncertain-failure behavior;
- next: Squido token-endpoint integration, rotated broker-grant replacement, direct repository discovery, and repository picker;
- deferred: branch/folder pickers, GitHub App publishing, write-scoped tokens, destination migration, and removal of manual PAT mode.

## Related documents

- [Authentication](authentication.md) explains the user-facing setup and local credential-storage posture.
- [Security](security.md) is the concise operational checklist.
- [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md) records the local storage decision.
- [ADR-0002: Authentication lifecycle](decisions/ADR-0002-authentication-lifecycle.md) records why the five-layer lifecycle was accepted.
- [Connections and destinations](destinations.md) defines publishing configuration separately from authentication.
