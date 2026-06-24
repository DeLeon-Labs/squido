# Publish manifest

Squido stores its manifest in Obsidian's plugin data alongside its settings. It does not modify note frontmatter by default.

Each record is keyed by the local note path and stores:

- `localNotePath`: current vault-relative Markdown path
- `targetOwner`: GitHub user or organization that owns the destination repository
- `targetRepo`: destination repository name
- `targetBranch`: destination branch
- `targetRepoPath`: repository-relative destination path
- `publishedUrl`: GitHub file URL when returned by the API
- `remoteFileSha`: GitHub blob/file SHA returned for the remote file and required for its next update
- `lastPublishedHash`: local SHA-256 content hash captured after the last successful publish
- `lastPublishedAt`: ISO 8601 timestamp of the last successful publish
- `status`: lifecycle status such as `published`, `published-with-local-changes`, `deleted`, or `error`

An untracked note is treated as `unpublished` without creating a manifest entry.

After a local edit, Squido hashes the current note and compares it with `lastPublishedHash`. A mismatch means the note is published with local changes; it does not mean the remote publish failed.

On republish, Squido sends `remoteFileSha` with the update request, because GitHub requires the blob SHA of the file being replaced. After a successful update, Squido stores the newly returned remote SHA, the new local content hash, the new timestamp, and `published` status together. A failed update must not advance those last-successful-publish values.

Renames and moves change the manifest key, local path, and derived remote path, then mark the note as having local publishing changes. Local deletion preserves the record and marks it deleted so publish history is not silently lost. The alpha does not delete or move remote files.
