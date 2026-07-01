# Squido

Squido is a lightweight publishing layer for Obsidian. It manages the publishing lifecycle of selected Markdown notes through the GitHub Contents API, so a writer does not need to maintain a second local notes repository just to publish.

Squido exists for a narrow job: connect Obsidian notes to configured publishing destinations, publish selected notes, remember publish state, detect later local edits, and update the same remote files when the writer republishes. GitHub is the first destination provider; Squido does not present itself as a developer-facing Git client.

The project is experimental. The first release was `0.1.0-alpha`; the current development build is `0.2.2-alpha`, focused on proving the GitHub App connection trust flow before publishing moves to connection-based credentials.

## Current alpha scope

- Publish the current Markdown note from a command or ribbon icon.
- Confirm the destination and edit the commit message before publishing.
- Publish to one implicit GitHub destination made from repository, branch, and folder/path settings.
- Use a manually configured GitHub token as an alpha/Advanced fallback.
- Connect a GitHub App through the Squido auth broker to prove installation and polling lifecycle.
- Keep destination details, the GitHub file SHA, the local content hash, the published URL, and the last-published timestamp in Squido's local plugin data rather than note frontmatter.
- Detect local changes made after a successful publish.
- Republish an already-published note to update the same remote file.
- Generate plain-language commit messages for first publish and update operations.
- Keep tracked paths current when notes are renamed or moved.
- Mark tracked notes when they are modified or deleted locally.

## Intentionally not included

Squido is not a CMS or a digital garden platform. It does not build a site, render pages, manage navigation, or move and route notes inside a vault. Publishing rules, automatic republishing, batch publishing, and other Git platforms are future roadmap work—not hidden behavior in the MVP.

Future Lighthouse and Note Actions integrations will use public APIs or events. Squido will not require either plugin and will not tightly couple to their internals.

## Basic usage

1. Install the plugin in an Obsidian vault.
2. Open **Settings → Squido**.
3. For current publishing, enter a GitHub token with Contents write access, the owner or organization, repository, branch, and optional target folder under **Advanced manual publishing**.
4. Open a Markdown note.
5. Run **Squido: Publish current note** from the command palette or select the upload ribbon icon.
6. Confirm the publish. The generated message can be overridden when needed.

Squido's lifecycle defaults are `Publish: {{title}}` for the first publish and `Update: {{title}}` for later republishes. Squido replaces `{{title}}` with the note filename without its `.md` extension. Writers may override the generated message, but they should not need Git vocabulary for routine publishing.

> [!CAUTION]
> The alpha manual PAT fallback stores the GitHub token in Obsidian's local plugin data. Protect the vault and use a fine-grained token limited to the destination repository. The strategic public setup path is GitHub App installation, not manual token setup.

## How Squido connects to GitHub

The strategic auth model is GitHub App installation. In `0.2.2-alpha`, **Connect GitHub** starts a broker-backed GitHub App installation flow and stores only non-sensitive installation metadata after completion. This does not yet enable publishing, repository discovery, branch/folder picking, or destinations.

Manual personal access tokens remain available during alpha as an explicit advanced/manual mode.

Canonical docs:

- [Authentication](docs/authentication.md)
- [Security](docs/security.md)
- [Connections and destinations](docs/destinations.md)

## Publishing lifecycle

Squido tracks whether a note is unpublished, published, changed locally after publish, or ready to republish. The lifecycle contract is documented in [docs/publishing-lifecycle.md](docs/publishing-lifecycle.md), and the local manifest model is documented in [docs/publish-manifest.md](docs/publish-manifest.md).

## Destination behavior

The current alpha uses one implicit GitHub destination from settings. The planned connection, destination, binding, and rule model is documented in [docs/destinations.md](docs/destinations.md).

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

Release builds produce exactly `main.js`, `manifest.json`, and `styles.css`. Non-release builds also produce `build-info.json` for the Developer diagnostics panel. The `dist/` folder is generated locally and is not committed. Obsidian's runtime `data.json` is also ignored.

Use a non-release build when deploying to a test vault:

```sh
CI=true pnpm run build:dev
```

The generated Developer section shows the build version, branch, commit, build timestamp, dirty state, and relevant development defaults. It is hidden from production builds because production builds omit `build-info.json`.

Before submitting changes, run:

```sh
pnpm run typecheck
pnpm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [ROADMAP.md](ROADMAP.md) for planned milestones. The docs index is [docs/architecture.md](docs/architecture.md).

## License

MIT © DeLeon Labs
