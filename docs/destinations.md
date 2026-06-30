# Connections and Destinations

Squido is a content synchronization and publishing bridge. Obsidian is the editing surface. GitHub is the first publishing backend and the canonical published content store.

GitHub is the first provider. Future providers should not be added until the GitHub connection and destination model is stable.

## Connection concept

A connection represents authenticated access to an external service.

For GitHub, a connection contains:

- provider: `github`
- account or organization context
- GitHub App installation identity
- authenticated username/account metadata
- accessible repositories limited by granted GitHub App permissions
- trust/revocation status

Connections do not define where notes publish. They define what Squido is allowed to see and use.

Manual PAT setup remains an Advanced alpha fallback. It should be represented as a connection-like fallback path, but it does not provide the same selected-repository trust model as GitHub App installation.

## Destination concept

A destination is a named publishing target. At a high level it contains:

- connection ID
- repository
- branch
- folder/path prefix
- publish mode
- published URL pattern or resolver
- future metadata/schema settings
- status metadata needed to publish safely

Destinations belong to connections. One GitHub connection may expose multiple repositories, and Squido may define multiple destinations from that connection.

The current alpha has one implicit destination made from settings fields. The connection integration milestone should keep that single implicit destination behavior while replacing manual-only setup with broker-backed connection and picker UI. The Destination-Based Publishing MVP should later turn the implicit configuration into an explicit destination model without breaking existing alpha users.

GitHub import is the companion workflow for destinations that already contain Markdown. See [github-import-workflow.md](github-import-workflow.md).

## Multiple GitHub destinations

One GitHub connection may own multiple destinations. Destinations may target the same repository or different repositories granted to the same GitHub App installation.

Examples:

- **Publication Log:** append selected notes or entries to `/published/publication-log.md`.
- **Articles:** publish individual notes to `/published/articles/{{slug}}.md`.
- **Documentation content:** publish notes into a static-site Markdown content folder.

This lets one GitHub account or organization connection support several publishing workflows without requiring separate authentication for each one.

## Destination publish modes

Initial destination modes:

- `file`: create or update one remote file per source note. This is the default mode for articles, docs pages, and website content files.
- `append`: append source content to a configured remote file. This supports journal/log workflows where many source notes or selected entries accumulate into one published Markdown file.

Later modes:

- `index`: generate or update an index/list file from selected notes or bindings.
- `pr`: publish changes through a pull request instead of committing directly to the target branch.
- `archive`: move or copy published content into an archive path according to explicit user action.

Later modes should be designed only when the preceding destination and conflict model is stable.

## Rules

A Rule suggests or auto-selects destinations based on note metadata or location. Rules are routing assistance, not publishing authority.

Rule inputs:

- folder path
- tag
- frontmatter property
- filename pattern
- active Lighthouse Focus later, not now

Rules must not auto-publish unless the user explicitly enables auto-publish in a later automation milestone. A matched rule may preselect a destination, explain why it matched, and let the user confirm the publish.

## Relationship

```text
Connection
  └─ grants access to account/org repositories
      └─ Destination
          └─ saves repo + branch + folder/path + URL settings
              └─ Binding
                  └─ links source note to destination remote path
```

## Destination-Based Publishing MVP

After connection integration, Squido should support multiple GitHub publishing destinations with clear repo/folder/URL mappings, a destination picker, and per-note per-destination publish tracking.

Connection integration is intentionally narrower than Destination-Based Publishing:

- 0.2.4 proves Connect GitHub, Disconnect, repository picker, branch picker, folder picker, PAT migration, and the existing publish button.
- 0.3.x turns the single implicit destination into explicit destination records and adds destination selection/routing.

Planned work:

1. Add destination data model.
2. Add destination settings UI.
3. Add destination picker to publish flow.
4. Add `file` publish mode.
5. Add `append` publish mode.
6. Track publish status per note per destination.
7. Add post-publish URL handling.
8. Preserve current single-destination alpha behavior.
9. Document the Obsidian source-of-truth publishing model.
10. Leave optional Lighthouse Focus integration for a later milestone.

## Non-goals

- Do not implement multi-platform publishing yet.
- Do not implement Lighthouse integration yet.
- Do not implement auto-publish yet.
- Do not move or route notes inside the vault.
- Do not build site navigation.
- Do not make GitHub App auth depend on the destination data model unless necessary.
