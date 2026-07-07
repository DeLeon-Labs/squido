# ADR-0001: Secure credential storage strategy

Status: Accepted

Date: 2026-07-02

## Context

Squido's GitHub App architecture now uses a broker-backed connection flow. After a successful GitHub setup callback, the broker can issue an opaque broker grant that Squido uses to verify an existing connection without reopening GitHub.

The grant is not a GitHub token and does not authorize publishing by itself. It is still sensitive because it identifies a trusted connection and may later be used to obtain or authorize short-lived GitHub installation tokens.

Obsidian plugin data is stored as ordinary JSON in the plugin folder. It is appropriate for settings, manifest records, bindings, and connection/session metadata when paired with broker-side revocation and rotation. It is not an OS secure secret store.

Squido must work across Obsidian desktop and mobile. Desktop runs in Electron. Mobile runs in Capacitor. Electron has OS-backed `safeStorage`; Capacitor can reach iOS Keychain and Android Keystore only through native plugin code that ordinary Obsidian community plugins do not control. Obsidian does not currently expose a secure cross-platform credential storage API to community plugins.

## Decision

Squido will treat credential storage as a capability, not as an assumption.

1. Connection metadata and broker session/grant material may be stored through Squido's current plugin-data `CredentialStore` implementation.
2. The plugin-data `CredentialStore` is the current reference implementation and the best known plugin-only architecture under today's Obsidian plugin API constraints.
3. Squido must document that plugin data is not OS secure storage and should not describe this model as absolute security.
4. Squido should keep broker sessions revocable and rotatable to reduce the risk of local plugin-data storage.
5. Desktop secure storage should prefer Electron `safeStorage` if it is accessible from Obsidian plugins in a supported, non-fragile way.
6. Linux secure storage must detect unsafe/basic fallback modes and treat them as unavailable.
7. Mobile persistent secure storage is not assumed unless Obsidian exposes a secure storage API or Squido adopts a native integration strategy.
8. If a stronger secure-storage backend becomes available, it may replace the plugin-data backend without changing the authentication lifecycle.
9. Squido must not persist GitHub installation tokens in plugin data.
10. Squido must never store the GitHub App private key, broker signing secrets, or provider client secrets in the plugin.

## Consequences

- Squido can keep a smooth plugin-only user experience while acknowledging the storage limitation.
- The `CredentialStore` boundary lets future storage backends replace plugin data if better host-platform capabilities become available.
- Public documentation must not present `data.json` storage as OS secure storage.
- Mobile and desktop can share the same reference implementation until a better cross-platform capability exists.
- The broker should keep sessions/grants revocable and suitable for device/session modeling.

## References

- [Secure credential storage investigation](../credential-storage-investigation.md)
- [Authentication](../authentication.md)
- [Security](../security.md)
