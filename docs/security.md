# Security

Squido sends note content to the GitHub repository configured by the user. The alpha stores its GitHub token in Obsidian's local plugin data because Obsidian does not provide a cross-platform plugin secrets store.

Use a fine-grained personal access token restricted to the destination repository with only the Contents permission needed to write files. Do not share or commit the plugin's `data.json` file. Treat vault backups and synced Obsidian configuration as sensitive if they include plugin data.

Before each publish, Squido presents a confirmation modal and an editable commit message. It does not auto-publish, publish folders, inspect frontmatter for rules, or send note content to any service other than the configured GitHub API endpoint.

