# Squido

Squido is a lightweight publishing layer for Obsidian. It manages the publishing lifecycle of selected Markdown notes through the GitHub Contents API, so a writer does not need to maintain a second local notes repository just to publish.

Squido exists for a narrow job: connect Obsidian notes to configured publishing destinations, publish selected notes, remember publish state, detect later local edits, and update the same remote files when the writer republishes. GitHub is the first destination provider; Squido does not present itself as a developer-facing Git client.

The project is experimental. The first release is `0.1.0-alpha`; current planning is focused on the vNext connection and destination architecture.

## Current alpha scope

- Publish the current Markdown note from a command or ribbon icon.
- Confirm the destination and edit the commit message before publishing.
- Publish to one implicit GitHub destination made from repository, branch, and folder/path settings.
- Use a manually configured GitHub token as an alpha/Advanced fallback.
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
3. Enter a GitHub token with Contents write access, the owner or organization, repository, branch, and optional target folder.
4. Open a Markdown note.
5. Run **Squido: Publish current note** from the command palette or select the upload ribbon icon.
6. Confirm the publish. The generated message can be overridden when needed.

Squido's lifecycle defaults are `Publish: {{title}}` for the first publish and `Update: {{title}}` for later republishes. Squido replaces `{{title}}` with the note filename without its `.md` extension. Writers may override the generated message, but they should not need Git vocabulary for routine publishing.

> [!CAUTION]
> The alpha manual PAT fallback stores the GitHub token in Obsidian's local plugin data. Protect the vault and use a fine-grained token limited to the destination repository. The strategic public setup path is GitHub App installation, not manual token setup.

## How Squido connects to GitHub

The strategic auth model is GitHub App installation. Squido should feel like **Connect GitHub → choose destination → publish/import**.

GitHub App auth is planned before destination-based publishing because it gives Squido the right permission shape: users and organizations can grant access to selected repositories instead of broad account-level OAuth scopes.

The bridge milestone is **0.2.4 — Connection Integration**. It should make Connect GitHub, Disconnect, repository picker, branch picker, folder picker, PAT migration, and the existing publish button work without introducing multiple destinations or a publishing router.

A **connection** represents GitHub provider access: account or organization context, installation identity, and accessible repositories. A **destination** belongs to a connection and stores publishing settings: repository, branch, folder/path, publish mode, optional URL pattern, and future metadata/schema settings.

One GitHub connection may contain multiple destinations. For example, a GitHub connection could have:

- **Publication Log:** append selected notes or entries to `/published/publication-log.md`.
- **Articles:** publish individual notes to `/published/articles/{{slug}}.md`.
- **Documentation content:** publish notes into a static-site Markdown content folder.

Rules can later suggest or select destinations from note folder, tag, frontmatter property, filename pattern, or active Lighthouse Focus. Rules should not auto-publish unless the user explicitly enables that behavior.

Manual personal access token setup remains available under Advanced during the alpha so existing users can keep publishing. Device Flow is not the strategic direction for Squido.

The callback strategy is documented in [docs/authentication.md](docs/authentication.md). The short version: GitHub redirects to a product-controlled HTTPS callback, the plugin polls a short-lived connection session, and Squido publishes directly to GitHub with short-lived installation tokens. The broker should not proxy note content.

## Publishing lifecycle

1. **Unpublished:** The note has no local publish record and no Squido-managed remote file.
2. **First publish:** Squido creates the remote file and records its destination, GitHub file SHA, local content hash, URL, timestamp, and published status.
3. **Published:** The current local content hash matches the hash stored after the last successful publish.
4. **Published with local changes:** The note was published before, but its current local hash differs from the last-published hash.
5. **Republish:** Squido updates the existing GitHub file using its current file SHA, then replaces the stored remote SHA and local hash with the values from the successful update.

Republishing is manual in `0.1.0-alpha`. Optional auto-republish remains later roadmap work and must be off by default, explicit about what will be sent, and controlled by granular settings and warnings.

## Destination behavior

The MVP publishes the note using its filename under the configured target folder. For example, `Notes/Hello.md` with a target folder of `content` is published as `content/Hello.md`. Two vault notes with the same filename can therefore target the same remote path; Squido shows the target in its confirmation flow, and broader path rules belong to a later milestone.

Planned destination publish modes:

- `file`: create or update one remote file per source note.
- `append`: append source content to a configured remote file.
- Later: index/list generation, PR mode, and archive mode.

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

### Experimental broker stages

The experimental auth branch adds broker test controls inside the non-release **Developer** section. These controls are discrete on purpose:

- **Test Broker Reachability** calls only `GET ${authBrokerBaseUrl}/health`.
- **Start Auth Flow** calls only `POST ${authBrokerBaseUrl}/auth/github/start`.
- **Complete GitHub Authentication** is intentionally disabled until real GitHub App authentication is designed.

`200 /health` with `{ ok: true }` means the broker is reachable. `501` from an auth route means the broker is reachable but that route is not implemented yet. Each stage reports the saved broker base URL, final request URL, method, status, response body, parsed response, and error message.

These broker tests do not publish notes, open Safari, request tokens, store tokens, touch manifests, create bindings, create destinations, or change the existing PAT publishing path.

Before submitting changes, run:

```sh
pnpm run typecheck
pnpm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries and [ROADMAP.md](ROADMAP.md) for planned milestones. The lifecycle contract is documented in [docs/publishing-lifecycle.md](docs/publishing-lifecycle.md). Authentication planning is documented in [docs/authentication.md](docs/authentication.md), destination planning is documented in [docs/destinations.md](docs/destinations.md), GitHub import planning is documented in [docs/github-import-workflow.md](docs/github-import-workflow.md), and the vNext architecture RFC is documented in [docs/rfc-squido-vnext-architecture.md](docs/rfc-squido-vnext-architecture.md).

## License

MIT © DeLeon Labs
