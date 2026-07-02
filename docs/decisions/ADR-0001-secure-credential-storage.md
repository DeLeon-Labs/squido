# ADR-0001: Secure credential storage strategy

Status: Accepted

Date: 2026-07-02

## Context

Squido's GitHub App architecture now uses a broker-backed connection flow. After a successful GitHub setup callback, the broker can issue an opaque broker grant that Squido uses to verify an existing connection without reopening GitHub.

The grant is not a GitHub token and does not authorize publishing by itself. It is still sensitive because it identifies a trusted connection and may later be used to obtain or authorize short-lived GitHub installation tokens.

Obsidian plugin data is stored as ordinary JSON in the plugin folder. It is appropriate for settings, manifest records, bindings, and non-sensitive connection metadata. It is not a secure secret store.

Squido must work across Obsidian desktop and mobile. Desktop runs in Electron. Mobile runs in Capacitor. Electron has OS-backed `safeStorage`; Capacitor can reach iOS Keychain and Android Keystore only through native plugin code that ordinary Obsidian community plugins do not control.

## Decision

Squido will treat credential storage as a capability, not as an assumption.

1. Non-sensitive connection metadata may be stored in Obsidian plugin data.
2. Broker grants, manual PATs, future refresh-capable grants, and cached installation tokens are sensitive credential material.
3. Alpha builds may store broker grants in plugin data only as an explicit testing compromise with clear labeling.
4. Before token vending or stable public GitHub App login, Squido must introduce a credential-store abstraction.
5. Desktop secure storage should prefer Electron `safeStorage` if it is accessible from Obsidian plugins in a supported, non-fragile way.
6. Linux secure storage must detect unsafe/basic fallback modes and treat them as unavailable.
7. Mobile persistent secure storage is not assumed unless Obsidian exposes a secure storage API or Squido adopts a native integration strategy.
8. If secure storage is unavailable, Squido should offer session-only/reconnect behavior instead of silently persisting sensitive grants in plaintext.
9. Squido must not store long-lived GitHub installation tokens in plugin data.
10. Squido must never store the GitHub App private key, broker signing secrets, or provider client secrets in the plugin.

## Consequences

- Alpha can keep testing smooth while acknowledging the storage limitation.
- Beta/stable work must include a `CredentialStore` design before token vending.
- Stable public releases must not present plaintext `data.json` storage as secure.
- Mobile may have different persistence behavior from desktop unless Obsidian exposes secure storage.
- The broker should keep grants revocable and suitable for session/device modeling.

## References

- [Secure credential storage investigation](../credential-storage-investigation.md)
- [Authentication](../authentication.md)
- [Security](../security.md)

