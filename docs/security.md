# Security

Squido sends note content to the GitHub destination configured by the user. The current alpha manual PAT fallback stores its manual GitHub token in Obsidian's local plugin data because Obsidian does not provide a cross-platform plugin secrets store.

The strategic authentication model is GitHub App installation. GitHub App auth should reduce permission blast radius by letting the user or organization grant Squido access to selected repositories through a connection. The GitHub App private key must never be bundled into the Obsidian plugin.

The planned callback flow uses a product-controlled HTTPS setup/callback URL and a short-lived connection session that the plugin polls. This avoids relying on fragile desktop/mobile deep links as the only return path. Optional Obsidian deep links may improve the experience, but polling is the compatibility baseline.

The auth broker is infrastructure, not a publishing service. It exists because GitHub App secrets cannot live inside the Obsidian plugin. The broker must not receive note content, vault content, destinations, bindings, manifests, publish rules, repository file contents, or Lighthouse state.

Squido should publish directly to GitHub after obtaining short-lived authorization. Markdown and other user-authored content should not be proxied through the broker.

Squido may store non-sensitive connection metadata locally, such as provider name, account login, account id, installation id, repository selection metadata, permission names, and connected timestamp.

Sensitive credential material requires secure local storage. If secure storage is unavailable, persistent GitHub App login should not silently fall back to plaintext plugin data. Squido should fail closed, require reconnect/session-only behavior, or ask the user to explicitly choose advanced/manual PAT mode with clear warnings.

Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files when using the Advanced fallback. Do not share or commit the plugin's `data.json` file. Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

Before each publish or republish, Squido presents a confirmation modal and an editable generated message. It does not auto-publish, publish folders, or send note content to any service other than the configured GitHub API endpoint.

Future Rules may inspect folder path, tag, frontmatter property, filename pattern, or active Lighthouse Focus later to suggest or auto-select destinations. Rules must not auto-publish unless the user explicitly enables that later behavior.

Optional auto-republish is later work. It must be disabled by default and require explicit warnings and granular controls before note content can be sent without per-publish confirmation.

Device Flow is not the strategic direction for Squido. Manual PAT fallback remains under Advanced while GitHub App auth is designed and implemented.
