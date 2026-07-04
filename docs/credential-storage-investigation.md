# Secure credential storage investigation

Status: investigation completed for the GitHub App Authentication MVP follow-up.

This document evaluates how Squido should store broker grants and future authentication material before token vending, repository discovery, or additional GitHub functionality is implemented.

## Summary

Squido should not treat Obsidian plugin data as a long-term secure credential store.

The current Obsidian plugin API exposes ordinary plugin persistence through `loadData()` and `saveData()`, which stores JSON data in the plugin folder as `data.json`. That is appropriate for settings, manifest data, publish bindings, and non-sensitive connection metadata. It is not a secure storage mechanism.

Obsidian desktop runs in Electron and Obsidian mobile runs in Capacitor. Electron has `safeStorage`, which can encrypt local data using platform facilities on macOS, Windows, and many Linux systems. Capacitor can reach iOS Keychain and Android Keystore from native plugins, but an ordinary Obsidian community plugin does not ship its own native Capacitor plugin into the Obsidian mobile app.

That means Squido's long-term architecture should separate credential storage by capability:

- Desktop: use an Obsidian-compatible secure storage adapter if Electron APIs are accessible and safe to use.
- Mobile: do not assume secure persistent credential storage is available unless Obsidian exposes it or Squido adopts a product-level mobile integration strategy.
- All platforms: keep broker grants short-lived, revocable, and bound to a generated device/session identifier so plaintext alpha storage is tolerable only as an explicitly labeled alpha/testing compromise.

## What is sensitive?

| Item | Sensitivity | Why |
| --- | --- | --- |
| GitHub App private key | Critical | Signs app JWTs and can mint installation tokens for all installations granted to the app. Must live only on broker infrastructure. |
| Installation token | Critical/high | Short-lived GitHub token that can read/write repositories within the installation permissions. Never store long-term in plugin data. |
| Manual PAT | High | User-created token; may have broad access depending on scopes. If stored locally, it is equivalent to direct GitHub API access. |
| Broker grant | High/medium | Not a GitHub token and should not publish by itself, but it can identify or refresh a Squido connection and may later be exchangeable for short-lived authorization. Treat as sensitive. |
| Broker flow ID/state | Medium | Short-lived correlation material. Useful for completing an auth attempt. Should expire quickly. |
| Installation ID | Low/medium | Identifies a GitHub App installation. Not secret alone, but should not be confused with an authorization credential. |
| Connection metadata | Low | Provider, account login/id/type, connected timestamp, and broker URL are operational metadata. Store locally in plugin data. |
| Publish bindings/manifests | User-sensitive, not auth-secret | May reveal vault paths and publishing relationships. Store locally, avoid sending to broker, and keep out of public repos. |

## Obsidian plugin capabilities

Current Obsidian plugins can persist data with `loadData()` and `saveData()`. The API definition states that this data is stored in `data.json` in the plugin folder. Squido already uses this path for settings and publish manifest data.

The public TypeScript API surface available to Squido does not expose a universal secure credential store. The API does expose platform flags:

- `Platform.isDesktopApp`: Electron-based desktop app
- `Platform.isMobileApp`: Capacitor-based mobile app
- `Platform.isIosApp`
- `Platform.isAndroidApp`

Those flags can guide platform behavior, but they are not credential storage APIs.

Community convention varies. Many plugins store API keys or tokens in plugin settings or local storage because it is simple and cross-platform. Obsidian Git is a representative example: its isomorphic-git path stores username and password/PAT via Obsidian local storage, while its native Git documentation recommends Git credential helpers such as `libsecret` for secure storage outside the plugin.

That convention is useful for alpha/testing expectations, but Squido should not copy it as the stable public security model.

## Platform secure storage options

### macOS Keychain

macOS Keychain is the appropriate native storage backend for app-local secrets. Electron `safeStorage` uses Keychain on macOS for its encryption key. Direct Keychain access from an Obsidian plugin would require a native module or a host-provided API; an ordinary cross-platform plugin should prefer an Obsidian-compatible Electron bridge if available.

### Windows Credential Manager / DPAPI

Windows provides Credential Manager and DPAPI-style user-bound protection. Electron `safeStorage` uses DPAPI on Windows. This is suitable for protecting encrypted blobs from other OS users, but it does not protect against malicious code running as the same user with access to the running app.

### Linux Secret Service / libsecret

Linux support depends on the user's desktop environment and secret-service availability. Electron `safeStorage` can use GNOME libsecret, KDE Wallet variants, or portal-based secret providers. If no suitable secret store is available, Electron may fall back to weak/basic storage. Squido must detect that case and avoid claiming secure persistence.

### iOS Keychain

iOS Keychain is the correct native primitive. Capacitor plugins can expose native Swift code to JavaScript, but an Obsidian community plugin does not control the native Obsidian iOS shell. Squido should not assume direct iOS Keychain access unless Obsidian exposes it or Squido ships a separate native/mobile integration.

### Android Keystore

Android Keystore protects key material and can keep keys non-exportable. Like iOS, this requires native Android access. A normal Obsidian plugin running inside the Obsidian mobile Capacitor app should not assume it can add native Android secure-storage code.

## Electron ecosystem

Electron `safeStorage` is the most relevant desktop path because it is part of Electron itself and uses OS-provided cryptography systems. Its current docs recommend the asynchronous APIs because they are non-blocking, support key rotation, and handle temporary unavailability. Important limitations:

- It is a main-process Electron module.
- Squido must verify whether Obsidian plugins can safely access it from the plugin runtime.
- Linux can fall back to `basic_text`; Squido must detect and reject that as secure storage.

`keytar` historically provided native password storage via macOS Keychain, Windows Credential Vault, and Linux Secret Service/libsecret. The original Atom `node-keytar` repository is archived, and native modules are a poor fit for Obsidian mobile. It should not be Squido's default architecture.

## Architecture options

### Option A — Store broker grant in plugin data

Security: weak. The grant lives in `data.json`, may sync with vault configuration, and is readable by anything with filesystem access.

UX: excellent. Works everywhere Obsidian plugins work.

Complexity: low.

Maintenance: low.

Suitability: acceptable only for alpha/dev with explicit labeling, short grant lifetime, revocation, and user warnings. Not suitable for stable public persistent GitHub App login.

### Option B — Store broker grant in platform secure storage

Security: best available local model. Uses OS-backed storage where possible.

UX: good when available; confusing if unavailable unless handled clearly.

Complexity: medium/high. Desktop may be feasible through Electron `safeStorage`; mobile likely requires host support from Obsidian or a native integration path outside ordinary plugin capabilities.

Maintenance: medium/high because Linux backend availability, Electron API access, and mobile support vary.

Suitability: recommended target for beta/stable where technically available.

### Option C — Store no persistent grant and require reconnect

Security: strong local posture because no persistent credential material is retained.

UX: weaker, especially on mobile and for frequent publishing.

Complexity: low/medium.

Maintenance: low.

Suitability: good fallback when secure storage is unavailable. Should be a clear "session-only" or "Reconnect each time" mode, not a silent failure.

### Option D — Server-side connection session with revocable device grants

Security: potentially strong if the broker stores only hashed grant identifiers, grants are revocable, scoped per device, and token vending remains short-lived. Still requires a local bearer artifact unless users reconnect every session.

UX: best balance if paired with secure local storage where possible.

Complexity: medium/high because it requires connection records, grant rotation, revocation, expiration, and device naming.

Maintenance: medium/high, but it aligns with Squido's broker architecture.

Suitability: recommended long-term complement to Option B. The broker grant should be treated like a revocable device/session record, not a permanent credential.

## Recommendation

### Alpha

- Store broker grant in plugin data only as an explicit alpha/testing compromise.
- Label the storage limitation in Settings and docs.
- Keep broker grants revocable, device/session-bound, and avoid giving them publishing power by themselves.
- Do not store installation tokens in plugin data.
- Manual PAT remains advanced/manual and must warn users about local storage.

### Beta

- Introduce a `CredentialStore` abstraction before token vending.
- Implement desktop secure storage if Electron `safeStorage` is accessible from Obsidian plugins without fragile hacks.
- Detect unsafe Linux fallback modes such as `basic_text` and treat them as unavailable.
- Use session-only/reconnect behavior where secure storage is unavailable.
- Store connection metadata in plugin data; store broker grants and any refresh-capable material only in the credential store.

### Stable public release

- Require secure storage for persistent GitHub App login.
- If secure storage is unavailable, offer session-only mode or explicit advanced/manual PAT mode with warnings.
- Never silently downgrade from secure storage to plaintext plugin data.
- Keep GitHub App private key only on broker infrastructure.
- Keep installation tokens short-lived and avoid persisting them unless there is a clearly documented secure-cache reason.
- Support revocation, disconnect, and grant rotation.

## Open implementation questions

- Can an Obsidian desktop plugin access Electron `safeStorage` in a supported way across current Obsidian desktop builds?
- Is `safeStorage` available from the plugin context directly, or only through main-process APIs that Obsidian does not expose?
- What secure-storage behavior is acceptable on Linux when secret service is temporarily unavailable?
- Should the broker grant be rotated after every successful verification/token exchange?
- What grant expiration policy is acceptable for alpha, beta, and stable?
- Should device/session identifiers be user-visible and user-renamable for revocation UX?
- Can Obsidian expose a mobile secure-storage plugin API in the future, or should Squido keep mobile GitHub App auth session-only until then?

## References checked

- Obsidian TypeScript API from the installed `obsidian` package: `Plugin.loadData()`, `Plugin.saveData()`, `Platform`, `FileSystemAdapter`, and `CapacitorAdapter`.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Android Keystore system](https://developer.android.com/privacy-and-security/keystore)
- [Capacitor iOS plugin guide](https://capacitorjs.com/docs/plugins/ios)
- [Capacitor Android plugin guide](https://capacitorjs.com/docs/plugins/android)
- [freedesktop.org Secret Service API](https://specifications.freedesktop.org/secret-service/latest/)
- [atom/node-keytar](https://github.com/atom/node-keytar)
- Representative Obsidian plugin review: [Obsidian Git](https://github.com/Vinzent03/obsidian-git)
