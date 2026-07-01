# Security

Squido sends note content to the GitHub destination configured by the user. The current alpha manual PAT fallback stores its manual GitHub token in Obsidian's local plugin data because Obsidian does not provide a cross-platform plugin secrets store.

The strategic authentication model is GitHub App installation. GitHub App auth should reduce permission blast radius by letting the user or organization grant Squido access to selected repositories through a connection. The GitHub App private key must never be bundled into the Obsidian plugin.

The planned callback flow uses a product-controlled HTTPS setup/callback URL and a short-lived connection session that the plugin polls. This avoids relying on fragile desktop/mobile deep links as the only return path. Optional Obsidian deep links may improve the experience, but polling is the compatibility baseline.

The temporary local/dev broker tests do not store tokens, note data, publish bindings, destinations, manifests, or note content. They only store per-stage status, response status codes, optional response snippets, and the last error needed for debugging. The Developer diagnostics section is available only in non-release builds because it depends on generated `dist/build-info.json`, which production builds omit.

Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files when using the Advanced fallback. Do not share or commit the plugin's `data.json` file. Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

Before each publish or republish, Squido presents a confirmation modal and an editable generated message. It does not auto-publish, publish folders, or send note content to any service other than the configured GitHub API endpoint.

Future Rules may inspect folder path, tag, frontmatter property, filename pattern, or active Lighthouse Focus later to suggest or auto-select destinations. Rules must not auto-publish unless the user explicitly enables that later behavior.

Optional auto-republish is later work. It must be disabled by default and require explicit warnings and granular controls before note content can be sent without per-publish confirmation.

Device Flow is not the strategic direction for Squido. Manual PAT fallback remains under Advanced while GitHub App auth is designed and implemented.
