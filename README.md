# Squido

Squido is a lightweight publishing layer for Obsidian. It publishes selected Markdown notes directly to GitHub through the GitHub Contents API, so a writer does not need to maintain a second local notes repository just to publish.

Squido exists for a narrow job: move the current note from an Obsidian vault to a configured GitHub repository and remember what happened. It tracks the last published content hash, destination path, timestamp, URL, and current publish status so unpublished local changes are visible.

The project is experimental. The first release is `0.1.0-alpha`.

## MVP scope

- Publish the current Markdown note from a command or ribbon icon.
- Confirm the destination and edit the commit message before publishing.
- Publish to one GitHub repository, branch, and target folder.
- Keep publish metadata in Squido's local plugin data rather than note frontmatter.
- Detect changes made after a successful publish.
- Keep tracked paths current when notes are renamed or moved.
- Mark tracked notes when they are modified or deleted locally.

## Intentionally not included

Squido is not a CMS or a digital garden platform. It does not build a site, render pages, manage navigation, or move and route notes inside a vault. Publishing rules, automatic publishing, batch publishing, multiple destinations, and other Git platforms are future roadmap work—not hidden behavior in the MVP.

Future Lighthouse and Note Actions integrations will use public APIs or events. Squido will not require either plugin and will not tightly couple to their internals.

## Basic usage

1. Install the plugin in an Obsidian vault.
2. Open **Settings → Squido**.
3. Enter a GitHub token with Contents write access, the owner or organization, repository, branch, and optional target folder.
4. Open a Markdown note.
5. Run **Squido: Publish current note** from the command palette or select the upload ribbon icon.
6. Review the commit message and confirm the publish.

The default commit message template is `publish {{title}}`. Squido replaces `{{title}}` with the note filename without its `.md` extension.

> [!CAUTION]
> The alpha stores the GitHub token in Obsidian's local plugin data. Protect the vault and use a fine-grained token limited to the destination repository.

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
ln -s /Users/jon/Developer/DeLeon-Labs/squido/dist "<test-vault>/.obsidian/plugins/squido"
```

The `dist/` folder contains exactly `main.js`, `manifest.json`, and `styles.css`. It is generated locally and is not committed. Obsidian's runtime `data.json` is also ignored.

Before submitting changes, run:

```sh
pnpm run typecheck
pnpm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [ROADMAP.md](ROADMAP.md) for planned milestones. Technical notes live in [`docs/`](docs/).

## License

MIT © DeLeon Labs
