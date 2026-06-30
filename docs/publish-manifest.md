# Publish manifest

Squido stores local publishing metadata in Obsidian plugin data alongside settings. It does not modify note frontmatter by default.

The current alpha manifest is intentionally simple: it records one implicit destination made from owner/repo/branch/folder settings. vNext planning separates this into Connections, Destinations, Sources, and Bindings.

## Current alpha record

Each alpha record is keyed by the local note path and stores:

- `localNotePath`: current vault-relative Markdown path
- `targetRepoPath`: repository-relative destination path
- `publishedUrl`: GitHub file URL when returned by the API
- `lastPublishedHash`: local SHA-256 content hash captured after the last successful publish
- `lastPublishedAt`: ISO 8601 timestamp of the last successful publish
- `status`: lifecycle status such as `published`, `changed`, `deleted`, or `error`

An untracked note is treated as `unpublished` without creating a manifest entry.

## vNext planning model

The vNext architecture should split state into:

- **Connection:** provider access and trust context, initially GitHub App installation for an account or organization.
- **Destination:** saved publishing settings that belong to a connection, including repository, branch, folder/path, publish mode, optional URL pattern, and future metadata/schema settings.
- **Source:** local Obsidian Markdown identity and current vault path.
- **Binding:** relationship between a source and destination, including remote path, remote SHA, local content hash, published URL, timestamp, and publish/import state.

This split lets one connection expose multiple repositories, one connection contain multiple destinations, and one source note bind to multiple destinations.

Destination publish modes are part of destination configuration:

- `file`: create or update one remote file per source note.
- `append`: append source content to a configured remote file.

Later modes such as index/list generation, PR mode, and archive mode should remain planning concepts until the core destination and conflict model is stable.

A future Rule may suggest or auto-select a destination based on folder path, tag, frontmatter property, filename pattern, or active Lighthouse Focus later. Rules must not auto-publish unless that behavior is explicitly enabled by the user in a later automation milestone.

## Hash and SHA responsibilities

After a local edit, Squido hashes the current note and compares it with the last published/imported local hash for the relevant binding. A mismatch means the local editing copy differs from the last known clean state. It does not prove the remote file changed.

On republish, Squido sends the remote SHA with the update request when updating an existing GitHub file. GitHub requires the blob/file SHA of the file being replaced. After a successful update, Squido stores the newly returned remote SHA, the new local content hash, the new timestamp, and the clean publish state together.

A failed update must not advance last-successful values.

## Rename, move, and delete behavior

Renames and moves update local source path metadata and may require binding review if the remote path is derived from the local path. Local deletion preserves publish history and marks the source/binding state so history is not silently lost.

The alpha does not delete or move remote files automatically. Future delete/unpublish behavior must be explicit.
