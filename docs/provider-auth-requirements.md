# Provider authentication and credential requirements

Squido should not grow a different security story for every publishing destination. Each provider integration must declare how it authenticates, what permissions it needs, where secrets are stored, and what local data is written.

## Credential storage standard

Squido must not store raw tokens, app passwords, API keys, refresh tokens, or private keys in Obsidian plugin `data.json`.

Plugin data may store:

- credential identifiers
- connected account labels
- granted scope labels
- destination metadata
- encrypted credential blobs when backed by OS-provided cryptography

Plugin data must not store:

- plaintext access tokens
- plaintext refresh tokens
- plaintext app passwords
- plaintext API keys
- provider private keys

For desktop builds, Squido follows the VS Code-style model: secrets are protected by platform credential or cryptography services and are retrieved only when needed for API calls. The current desktop implementation uses Electron `safeStorage` and refuses to store credentials if Electron reports an unsafe plaintext fallback such as Linux `basic_text`.

Mobile support requires a separate secure-storage adapter. Until that exists, Squido should remain desktop-only for credentialed publishing.

## Platform handling

Squido should not maintain separate user instructions for normal macOS, Windows, or Linux key storage. The local platform should handle the storage backend through the credential abstraction.

Platform-specific notes still matter:

- macOS: use Keychain-backed storage when available.
- Windows: use DPAPI-backed storage when available.
- Linux: use a Secret Service, KWallet, or portal-backed secret provider when available; refuse plaintext fallback.
- iOS/iPadOS/Android: do not support credentialed publishing until a mobile secure-storage adapter exists.

## Authorization standard

Credential storage protects the local machine. Authorization scope controls blast radius if the credential leaks.

Provider integrations should prefer, in order:

1. destination-scoped installation or project credentials
2. OAuth scopes narrowed to the publishing operation
3. app passwords or API keys scoped to the target site/project
4. broad account-level tokens only as explicit advanced fallback

GitHub App installation is the long-term best fit for GitHub because it can be limited to selected repositories. It is intentionally deferred until later releases because it adds app-registration and token-broker infrastructure.

## Provider landscape

| Provider | Likely auth model | Scope notes | Squido stance |
| --- | --- | --- | --- |
| GitHub | OAuth Device Flow now; GitHub App installation later | Device Flow OAuth scopes are broader than a selected repository. GitHub App installation can be repository-scoped. | Use Device Flow with secure local storage for now. Defer GitHub App installation until later infrastructure work. |
| GitLab | OAuth, personal access token, or project access token depending on deployment | OAuth/PAT scopes can be broad. Project access tokens are closer to Squido's destination model when available. | Require provider-specific research before implementation. Prefer project-scoped credentials. |
| Forgejo | OAuth2 or access tokens depending on instance configuration | Scope and app support can vary by instance. | Treat as a separate provider with capability detection. |
| Gitea | OAuth2 or access tokens depending on instance configuration | Route-level scopes may exist, but selected-repository authorization is not guaranteed. | Treat as a separate provider with capability detection. |
| Ghost | Admin API key/staff token | Admin API keys are powerful site-level credentials. | Require secure storage and explicit site-level warning. |
| WordPress | Application Passwords or OAuth depending on host/plugin setup | Application Passwords are user credentials for a site and must be stored securely. | Prefer Application Passwords only through secure storage and explicit site selection. |
| Medium | OAuth or integration token depending on API availability | Publishing API availability and auth capabilities can change. | Research before committing to support. |
| Micro.blog | App token | Token is account/service-scoped. | Store only through secure storage and document scope. |

## Provider checklist

Before adding a provider, create an issue that answers:

- What exact auth mechanism will be used?
- Does it require a client secret, app private key, or backend broker?
- Can access be limited to one repo, project, blog, or site?
- What is the minimum permission/scope?
- Does the token expire?
- Is refresh required?
- How does the user revoke access?
- What, if anything, is stored in `data.json`?
- Does the provider work on desktop only, or also mobile?
- What user warning is required in settings?
