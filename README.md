# Squido

Squido is a lightweight publishing layer for Obsidian. It manages the publishing lifecycle of selected Markdown notes through the GitHub Contents API, so a writer does not need to maintain a second local notes repository just to publish.

Squido exists for a narrow job: publish the current note to a configured GitHub repository, remember the published state, detect later local edits, and update the same remote file when the writer republishes. GitHub is the publishing backend; Squido does not present itself as a developer-facing Git client.

The project is experimental. The first release is `0.1.0-alpha`.

## MVP scope

- Publish the current Markdown note from a command or ribbon icon.
- Confirm the destination and edit the commit message before publishing.
- Publish to one GitHub repository, branch, and target folder.
- Use a manually configured GitHub token with repository Contents write access.
- Keep destination details, the GitHub file SHA, the local content hash, the published URL, and the last-published timestamp in Squido's local plugin data rather than note frontmatter.
- Detect local changes made after a successful publish.
- Republish an already-published note to update the same remote file.
- Generate plain-language commit messages for first publish and update operations.
- Keep tracked paths current when notes are renamed or moved.
- Mark tracked notes when they are modified or deleted locally.

## Intentionally not included

Squido is not a CMS or a digital garden platform. It does not build a site, render pages, manage navigation, or move and route notes inside a vault. Publishing rules, automatic republishing, batch publishing, multiple destinations, Device Flow/OAuth authentication, and other Git platforms are future roadmap work—not hidden behavior in the MVP.

Future Lighthouse and Note Actions integrations will use public APIs or events. Squido will not require either plugin and will not tightly couple to their internals.

## Basic usage

1. Install the plugin in an Obsidian vault.
2. Open **Settings → Squido**.
3. Enter a GitHub token with Contents write access, the owner or organization, repository, branch, and optional target folder.
4. Open a Markdown note.
5. Run **Squido: Publish current note** from the command palette or select the upload ribbon icon.
6. Confirm the publish. The generated message can be overridden when needed.

Squido's lifecycle defaults are `Publish: {{title}}` for the first publish and `Update: {{title}}` for later republishes. Squido replaces `{{title}}` with the note filename without its `.md` extension. Writers may override the generated message, but they should not need Git vocabulary for routine publishing.

> [!CAUTION]
> The alpha stores the GitHub token in Obsidian's local plugin data. Protect the vault and use a fine-grained token limited to the destination repository.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [ROADMAP.md](ROADMAP.md) for planned milestones. The lifecycle contract is documented in [docs/publishing-lifecycle.md](docs/publishing-lifecycle.md), with supporting technical notes in [`docs/`](docs/).

## License

MIT © DeLeon Labs
