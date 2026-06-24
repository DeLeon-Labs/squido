# Publish manifest

Squido stores its manifest in Obsidian's plugin data alongside its settings. It does not modify note frontmatter by default.

Each record is keyed by the local note path and stores:

- `localNotePath`: current vault-relative Markdown path
- `targetRepoPath`: repository-relative destination path
- `publishedUrl`: GitHub file URL when returned by the API
- `lastPublishedHash`: SHA-256 hash of the content from the last successful publish
- `lastPublishedAt`: ISO 8601 timestamp of the last successful publish
- `status`: `published`, `changed`, `deleted`, or `error`

An untracked note is treated as `unpublished` without creating a manifest entry.

Renames and moves change the manifest key, local path, and derived remote path, then mark the note as changed. Local deletion preserves the record and marks it deleted so publish history is not silently lost. The alpha does not delete or move remote files.

