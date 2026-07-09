# Authentication

Squido's strategic authentication model is GitHub App installation, not Device Flow. The product should feel like:

1. Select **Connect GitHub**.
2. Choose the GitHub account or organization.
3. Grant Squido access to the repository or repositories that should receive published notes.
4. Return to Obsidian.
5. Squido records a connection.
6. Choose repository, branch, and folder/path destinations from that connection.

Manual personal access token entry remains available under **Advanced** for local testing and recovery, but it is not the primary user path.

GitHub App authentication is the strategic path because it supports selected-repository installation and avoids asking users to create developer credentials. Manual PAT mode may remain available, but only as an explicit advanced/manual mode chosen by the user.

The accepted lifecycle model is [ADR-0002: Authentication lifecycle](decisions/ADR-0002-authentication-lifecycle.md). In short: GitHub owns repository permissions, the broker owns authentication metadata, and Squido owns publishing.

## Connection model

A GitHub connection contains the provider, account or organization context, authentication/installation identity, and the repositories accessible through granted GitHub App permissions.

A connection does not decide where a note publishes. Destinations belong to a connection and save repository, branch, folder/path, URL pattern, and future metadata/schema settings.

## Why GitHub App authentication

GitHub App installation fits Squido's publishing model better than OAuth scopes:

- GitHub can show the user which account or organization is installing Squido.
- The user or organization admin can grant access to selected repositories.
- Squido can request a narrow permission set, starting with repository Contents access.
- Short-lived installation tokens can be minted without storing a broad user token in the plugin.

Device Flow is useful for command-line or developer-style authentication, but it cannot provide the same selected-repository permission model. Squido should avoid asking users to paste OAuth Client IDs or manage developer credentials.

## GitHub App configuration plan

The official Squido GitHub App should use:

- App name: `Squido`
- Homepage URL: the public Squido project or product page
- Setup URL: a product-controlled HTTPS setup URL
- Callback URL: a product-controlled HTTPS callback URL
- Webhook URL: later, only if Squido needs server-side installation lifecycle tracking
- Repository permissions:
  - Contents: read and write
  - Metadata: read-only, granted by GitHub
- Account permissions: none unless a future feature explicitly requires them
- Installation target: user accounts and organizations

Exact URLs can move to a dedicated auth subdomain later, but they must remain product-controlled HTTPS URLs. Do not use localhost, personal URLs, or Obsidian-only custom URL schemes as the GitHub App's canonical callback.

## Callback and return strategy

The callback flow should be designed before auth implementation:

1. Squido requests a connection session from a Squido auth broker.
2. The broker creates a short-lived `state` value and returns a GitHub App installation URL.
3. Squido opens that URL in the user's browser.
4. The user installs Squido on a personal account or organization and chooses repository access in GitHub.
5. GitHub redirects to the product setup/callback URL with `installation_id`, `setup_action`, and `state`.
6. The broker validates `state`, records the installation metadata, and marks the connection session complete.
7. The browser page says the connection is complete and offers an optional **Open Obsidian** deep link.
8. Squido polls the broker for the connection session status and receives installation/account metadata plus an opaque broker grant for later connection verification.
9. Squido can use the broker grant to verify the existing GitHub App installation without reopening GitHub.
10. When Squido needs to publish in a later milestone, it asks the broker for a short-lived installation access token scoped to the selected installation/repository.
11. Squido sends note content directly to GitHub using the short-lived token. The broker should not proxy or store note content.

This polling-first strategy works on desktop and mobile because it does not depend on a custom URL callback successfully returning control to Obsidian. A deep link may improve the experience, but it should be optional.

### Already-installed GitHub App behavior

GitHub redirects to the configured setup URL after a first install. If **Redirect on update** is enabled, GitHub also redirects after installation updates such as adding or removing repository access.

If the Squido GitHub App is already installed and the user makes no repository-access changes, GitHub may keep the user on the installation/settings page instead of redirecting back to the broker setup URL. In that case, the broker never receives the stateful `installation_id` callback and Squido cannot safely mark that install-page flow connected.

That already-installed case should not be treated as the reconnect mechanism. After a successful setup callback, the broker creates a Squido broker grant tied to a `connection_id`, `installation_id`, account login/id/type, and creation timestamp. Squido stores that broker grant through its plugin-data `CredentialStore` and calls the broker connection-status endpoint to verify that the GitHub App installation still exists. If verification succeeds, Squido marks the connection **Connected** without opening GitHub. If verification fails or no broker grant exists, Squido shows **Reconnect GitHub** and starts a new GitHub install/setup flow.

Squido must not complete an already-installed flow without a broker-verified `installation_id` tied to the current stateful connection attempt.

Squido stores local GitHub App auth state as four separate concepts:

- setup flow: short-lived GitHub setup/bootstrap or repair attempt;
- connection: persistent provider/account/installation metadata;
- device: local generated device/session identifier used for broker verification;
- session: broker grant/session status stored through the plugin-data `CredentialStore`.

Normal reconnect uses **Verify Connection** to verify the stored broker session. It should not open GitHub. GitHub setup is reserved for first install, permission repair, or recovery when no valid local broker session exists.

**Manage GitHub Access** opens the GitHub installation settings URL returned by the broker/GitHub installation lookup when available. It is a repository-permission management action only. It must not start setup, create a `flow_id`, or change pending state.

**Disconnect This Device** revokes or clears the local broker session/device. It does not uninstall the GitHub App, remove the broker's persistent connection record, or imply that repository access changed. After device disconnect, Squido may preserve non-sensitive installation/account metadata to explain the state. Reattaching a disconnected device to an existing installation requires a future repair/reauthorization flow; it should not rely on forcing GitHub setup to redirect after no repository-access changes.

Storage note: the broker grant is not a GitHub token, but it is still sensitive because it can verify a Squido connection. Obsidian does not currently expose secure cross-platform credential storage to community plugins, so Squido stores broker session/grant information through its plugin-data `CredentialStore`. This is the current reference plugin-only implementation, not a claim of OS secure storage.

Squido's accepted storage direction is documented in [ADR-0001: Secure credential storage strategy](decisions/ADR-0001-secure-credential-storage.md), with platform research in [Secure credential storage investigation](credential-storage-investigation.md). Token vending should not proceed until the connection/device/session model is stable.

The current implementation uses `PluginDataCredentialStore` as the reference implementation because plugin data is the best currently known cross-platform option within the constraints of the Obsidian plugin API. The abstraction leaves room for future `SecureCredentialStore`, `SquidoConnectCredentialStore`, and `SessionOnlyCredentialStore` backends if those become practical.

### Broker grant hardening

The current broker grant should be treated as a revocable broker session artifact, not a proof of OS-secure persistent login. It allows Squido to verify a previously completed GitHub App installation without reopening GitHub, but it currently depends on local plugin-data storage because that is the best known plugin-only storage option available to Obsidian community plugins today.

Before token vending, repository discovery, or GitHub App credentialed publishing, Squido and the broker should harden the grant model:

- Squido generates or stores a stable random `device_session_id` for the local plugin installation.
- The broker should bind each broker grant to a connection, installation, account, and device/session identifier.
- Squido sends `device_session_id` when starting a GitHub App flow, verifying a stored broker grant, or revoking a connection.
- The broker should verify the grant and device/session identifier together.
- The broker should store only hashed grant material where practical.
- Grants should be revocable and expire according to a documented policy.
- Grants should rotate after successful verification or future token exchange where practical; Squido replaces the locally stored broker grant when the broker returns a rotated grant.
- Disconnect asks the broker to invalidate the current local grant where practical, then clears local GitHub App connection state.

This does not make plugin data secure. It reduces blast radius, supports revocation, and gives the broker enough structure to audit and retire individual local sessions. Secure OS-backed storage or Squido Connect remains a future improvement.

## Broker responsibility boundary

The auth broker is infrastructure, not Squido product logic. It exists because GitHub App private keys, broker signing secrets, and token-exchange credentials cannot safely live inside the Obsidian plugin.

Canonical broker decisions live in the broker repo:

- [ADR-0001: Auth broker does not handle note content](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions/ADR-0001-auth-broker-does-not-handle-note-content.md)
- [ADR-0002: GitHub App authentication uses broker plus short-lived GitHub tokens](https://github.com/DeLeon-Labs/squido-auth-broker/blob/main/docs/decisions/ADR-0002-github-app-auth-uses-broker-and-short-lived-tokens.md)

Squido owns note content, destinations, bindings, manifests, publish rules, import/sync/conflict policy, and Lighthouse integration state. The broker owns provider trust flow state and GitHub App secret handling. Publishing content should go directly from Squido to GitHub after Squido obtains short-lived authorization.

## Connection integration milestone

The implementation bridge after broker, credential storage, modular cleanup, grant hardening, and picker planning is **0.2.8 — Connection Integration**.

Its purpose is to integrate the broker into Squido without changing publishing behavior. Users should be able to connect GitHub, disconnect GitHub, choose a granted repository, choose a branch, choose a folder/path, and continue using the existing **Publish current note** action.

This milestone must also migrate existing manual PAT users cleanly. The PAT fallback can remain under **Advanced**, but existing users should not lose their current publish settings or need to recreate them manually.

0.2.8 should not introduce multiple destinations, a publishing router, Lighthouse integration, import workflows, or website workflows. Those features depend on a working connection integration but belong to later milestones.

**0.2.2 — GitHub App Authentication MVP** proves only the trust flow: a user can click **Connect GitHub**, install or authorize the Squido GitHub App, return through the broker, and see Squido marked **Connected**. It does not enable publishing, repository discovery, branch/folder picking, or destination setup yet.

## Credential boundaries

Public or non-secret data:

- GitHub App slug or app URL
- installation ID
- account login
- repository metadata
- selected destination metadata
- connection ID

Private data that must not be bundled into the Obsidian plugin:

- GitHub App private key
- broker signing secrets
- long-lived service credentials

Sensitive local data:

- short-lived installation tokens if cached locally
- broker grants or session artifacts that can authorize GitHub access
- manual personal access tokens if the advanced fallback is used

The GitHub App private key belongs only on product-controlled infrastructure. Squido should store only the minimum local credential material required for the current session or fallback flow.

No false security claims: Squido must document that plugin-data storage is not OS secure storage. Persistent GitHub App login should use the strongest storage backend reasonably available to the plugin. Today, that means plugin-data `CredentialStore` plus broker-side revocation, rotation, short-lived GitHub installation tokens, and a content-blind broker. See [ADR-0001](decisions/ADR-0001-secure-credential-storage.md) and [ADR-0002](decisions/ADR-0002-authentication-lifecycle.md).

## Manual token fallback

Manual PAT support remains under **Advanced** so existing alpha users can continue publishing while GitHub App auth is built. The fallback must be documented as less ideal because access depends on the token's scopes and is not naturally limited by GitHub's selected-repository installation UI.

Manual PAT mode should remain visibly separate from the GitHub App path. It should be a deliberate user choice, not an automatic fallback from failed secure storage.

## Remaining decisions and planned work

[ADR-0002: Authentication lifecycle](decisions/ADR-0002-authentication-lifecycle.md) is the source of truth for the authentication model.

Remaining decisions are limited to future product behavior such as additional-device pairing. Planned implementation work, such as the broker `AuthStore` / `KvAuthStore` boundary and the future token vending contract, should not be treated as unresolved architecture. Future Obsidian secure storage APIs and Squido Connect remain possible improvements, not dependencies for the current plugin-only architecture.
