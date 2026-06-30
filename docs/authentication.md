# Authentication

Squido's strategic authentication model is GitHub App installation, not Device Flow. The product should feel like:

1. Select **Connect GitHub**.
2. Choose the GitHub account or organization.
3. Grant Squido access to the repository or repositories that should receive published notes.
4. Return to Obsidian.
5. Squido records a connection.
6. Choose repository, branch, and folder/path destinations from that connection.

Manual personal access token entry remains available under **Advanced** for local testing and recovery, but it is not the primary user path.

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
8. Squido polls the broker for the connection session status and receives non-secret installation/account metadata.
9. When Squido needs to publish, it asks the broker for a short-lived installation access token scoped to the selected installation/repository.
10. Squido sends note content directly to GitHub using the short-lived token. The broker should not proxy or store note content.

This polling-first strategy works on desktop and mobile because it does not depend on a custom URL callback successfully returning control to Obsidian. A deep link may improve the experience, but it should be optional.

## Connection integration milestone

The first implementation milestone after broker and picker planning is **0.2.4 — Connection Integration**.

Its purpose is to integrate the broker into Squido without changing publishing behavior. Users should be able to connect GitHub, disconnect GitHub, choose a granted repository, choose a branch, choose a folder/path, and continue using the existing **Publish current note** action.

This milestone must also migrate existing manual PAT users cleanly. The PAT fallback can remain under **Advanced**, but existing users should not lose their current publish settings or need to recreate them manually.

0.2.4 should not introduce multiple destinations, a publishing router, Lighthouse integration, import workflows, or website workflows. Those features depend on a working connection integration but belong to later milestones.

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
- manual personal access tokens if the advanced fallback is used

The GitHub App private key belongs only on product-controlled infrastructure. Squido should store only the minimum local credential material required for the current session or fallback flow.

## Manual token fallback

Manual PAT support remains under **Advanced** so existing alpha users can continue publishing while GitHub App auth is built. The fallback must be documented as less ideal because access depends on the token's scopes and is not naturally limited by GitHub's selected-repository installation UI.

## Open questions before implementation

- What domain/subdomain will host the auth broker?
- Will the broker return short-lived installation tokens to Squido, or only broker token exchange? The preferred answer is short-lived tokens so note content goes directly from Obsidian to GitHub.
- How long should connection sessions live?
- How should the plugin recover if the browser flow completes but Obsidian is closed?
- What exact metadata should be stored in plugin data after connection?
