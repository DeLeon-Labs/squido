# Security

Squido sends note content to the GitHub repository configured by the user. Raw GitHub tokens, app passwords, API keys, and refresh tokens must not be stored as plaintext in Obsidian plugin data.

GitHub Device Flow is the preferred connection path for the current alpha because it lets users authorize Squido without creating and pasting a personal access token, and it does not require Squido to bundle an OAuth client secret. The OAuth app must have Device Flow enabled in GitHub. Squido requests the configured scope and stores the returned token through secure local storage.

The desktop build uses Electron `safeStorage`, backed by local OS cryptography services where available. Squido refuses to store credentials if the runtime reports an unsafe plaintext fallback.

Use the narrowest OAuth scope that works for the destination:

- `public_repo` for public repositories.
- `repo` when private repositories are required.

Manual token entry remains available as an advanced fallback. If using a token, prefer a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files. Do not share or commit the plugin's `data.json` file. Treat vault backups and synced Obsidian configuration as sensitive even when credentials are encrypted, because plugin data still contains publishing metadata and encrypted credential blobs.

Before each publish or republish, Squido presents a confirmation modal and an editable generated message. It does not auto-publish, publish folders, inspect frontmatter for rules, or send note content to any service other than the configured GitHub API endpoint.

Optional auto-republish is later work. It must be disabled by default and require explicit warnings and granular controls before note content can be sent without per-publish confirmation.

Repository and folder picker UI is later work. Until it lands, destination fields remain explicit text settings.

Future provider requirements are tracked in [provider-auth-requirements.md](provider-auth-requirements.md).
