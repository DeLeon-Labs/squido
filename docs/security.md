# Security

Squido sends note content to the GitHub repository configured by the user. The alpha stores its GitHub token in Obsidian's local plugin data because Obsidian does not provide a cross-platform plugin secrets store.

Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files. Do not share or commit the plugin's `data.json` file. Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

Before each publish or republish, Squido presents a confirmation modal and an editable generated message. It does not auto-publish, publish folders, inspect frontmatter for rules, or send note content to any service other than the configured GitHub API endpoint.

Optional auto-republish is later work. It must be disabled by default and require explicit warnings and granular controls before note content can be sent without per-publish confirmation.

Device Flow/OAuth authentication is also later work. The `0.1.0-alpha` lifecycle continues to use a manually configured token; authentication expansion must not be smuggled into the core publishing milestone.
