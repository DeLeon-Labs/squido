# Squido

Squido is a lightweight publishing layer for Obsidian. It manages the publishing lifecycle of selected Markdown notes through the GitHub Contents API, so a writer does not need to maintain a second local notes repository just to publish.

Squido exists for a narrow job: publish the current note to a configured GitHub repository, remember the published state, detect later local edits, and update the same remote file when the writer republishes. GitHub is the publishing backend; Squido does not present itself as a developer-facing Git client.

The project is experimental. The current working version is `0.1.1-alpha`.

## MVP scope

- Publish the current Markdown note from a command or ribbon icon.
- Confirm the destination and edit the commit message before publishing.
- Publish to one GitHub repository, branch, and target folder.
- Connect GitHub with OAuth Device Flow or use a manually configured GitHub token with repository Contents write access.
- Store credentials through secure local storage rather than plaintext plugin data.
- Keep destination details, the GitHub file SHA, the local content hash, the published URL, and the last-published timestamp in Squido's local plugin data rather than note frontmatter.
- Detect local changes made after a successful publish.
- Republish an already-published note to update the same remote file.
- Generate plain-language commit messages for first publish and update operations.
- Keep tracked paths current when notes are renamed or moved.
- Mark tracked notes when they are modified or deleted locally.

## Intentionally not included

Squido is not a CMS or a digital garden platform. It does not build a site, render pages, manage navigation, or move and route notes inside a vault. Publishing rules, automatic republishing, batch publishing, multiple destinations, repository picker UI, and other Git platforms are future roadmap work—not hidden behavior in the MVP.

Future Lighthouse and Note Actions integrations will use public APIs or events. Squido will not require either plugin and will not tightly couple to their internals.

## Basic usage

1. Install the plugin in an Obsidian vault.
2. Open **Settings → Squido**.
3. Connect GitHub with Device Flow, or enter a manual token as an advanced fallback.
4. Enter the owner or organization, repository, branch, and optional target folder.
5. Open a Markdown note.
6. Run **Squido: Publish current note** from the command palette or select the upload ribbon icon.
7. Confirm the publish. The generated message can be overridden when needed.

Squido's lifecycle defaults are `Publish: {{title}}` for the first publish and `Update: {{title}}` for later republishes. Squido replaces `{{title}}` with the note filename without its `.md` extension. Writers may override the generated message, but they should not need Git vocabulary for routine publishing.

> [!CAUTION]
> The alpha stores encrypted credential material and publishing metadata locally. Protect the vault, avoid broad OAuth scopes, and request the narrowest scope that works for the destination repository.

## GitHub Device Flow

Device Flow is the recommended GitHub connection path. It avoids asking users to create and paste personal access tokens and does not require Squido to bundle an OAuth client secret.

Squido does not store the returned token as plaintext in Obsidian plugin data. On desktop, credentials are stored through Electron `safeStorage`, which uses local OS cryptography services where available. If secure storage is unavailable or falls back to plaintext, Squido refuses to store the credential.

To use it during development:

1. Create or use a GitHub OAuth app with Device Flow enabled.
2. Copy the OAuth app's client ID into **Settings → Squido → OAuth Client ID**.
3. Choose the OAuth scope:

   - `public_repo` for publishing only to public repositories.
   - `repo` for publishing to private repositories.

4. Select **Connect GitHub**.
5. Complete authorization in GitHub, then return to Obsidian.

Manual token entry remains available as an advanced fallback. Repository and folder picker UI is tracked separately; until that lands, destination fields remain text inputs.

Credentialed publishing is desktop-only until Squido has a mobile secure-storage adapter.

## Publishing lifecycle

1. **Unpublished:** The note has no local publish record and no Squido-managed remote file.
2. **First publish:** Squido creates the remote file and records its destination, GitHub file SHA, local content hash, URL, timestamp, and published status.
3. **Published:** The current local content hash matches the hash stored after the last successful publish.
4. **Published with local changes:** The note was published before, but its current local hash differs from the last-published hash.
5. **Republish:** Squido updates the existing GitHub file using its current file SHA, then replaces the stored remote SHA and local hash with the values from the successful update.

Republishing is manual in `0.1.0-alpha`. Optional auto-republish remains later roadmap work and must be off by default, explicit about what will be sent, and controlled by granular settings and warnings.

## Destination behavior

The MVP publishes the note using its filename under the configured target folder. For example, `Notes/Hello.md` with a target folder of `content` is published as `content/Hello.md`. Two vault notes with the same filename can therefore target the same remote path; Squido shows the target in its confirmation flow, and broader path rules belong to a later milestone.

## Development

Requirements: Node.js, pnpm, and an Obsidian vault for manual testing.

```sh
pnpm install
pnpm run dev
```

The development process watches `src/main.ts` and writes the complete Obsidian runtime bundle to `dist/`. Point the test vault's plugin folder at that directory, then enable Squido in Obsidian:

```sh
ln -s "/path/to/squido/dist" "/path/to/test-vault/.obsidian/plugins/squido"
```

The `dist/` folder contains exactly `main.js`, `manifest.json`, and `styles.css`. It is generated locally and is not committed. Obsidian's runtime `data.json` is also ignored.

Before submitting changes, run:

```sh
pnpm run typecheck
pnpm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [ROADMAP.md](ROADMAP.md) for planned milestones. The lifecycle contract is documented in [docs/publishing-lifecycle.md](docs/publishing-lifecycle.md), and provider security requirements are documented in [docs/provider-auth-requirements.md](docs/provider-auth-requirements.md).

## License

MIT © DeLeon Labs
