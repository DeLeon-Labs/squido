# Publishing lifecycle

Squido treats publishing as a lifecycle, not a one-off file transfer. The local manifest is the record of what Squido last published and the basis for deciding what action the current note needs.

| State | Meaning | Available manual action |
| --- | --- | --- |
| Unpublished | No manifest record exists for the note. | Publish |
| Published | Current local content matches the last successfully published local hash. | Republish if explicitly requested |
| Published with local changes | Current local content differs from the last successfully published local hash. | Republish/update |
| Deleted locally | A previously tracked local note was deleted. | No remote deletion in the alpha |
| Error | The latest publishing attempt failed; last-successful metadata remains authoritative. | Correct the problem and retry |

## First publish

For a first publish, Squido:

1. Resolves the configured owner or organization, repository, branch, and target path.
2. Generates `Publish: {{title}}` and allows a manual override.
3. Creates the remote Markdown file through the GitHub Contents API.
4. Computes the local content hash for the content that was sent.
5. Stores the destination identity, returned remote file SHA, local content hash, published URL when available, timestamp, and `published` status.

The manifest update happens only after GitHub confirms the publish.

## Local edits and status

Squido computes the current local content hash and compares it with the hash stored after the last successful publish. Matching hashes mean `published`. Different hashes mean `published with local changes`.

This comparison is local and answers one narrow question: has the note changed locally since Squido last published it? It does not claim that the remote file is unchanged. Remote validation and conflict detection remain `0.9.0-alpha` work.

## Republish

For a republish, Squido:

1. Reads the existing manifest record.
2. Generates `Update: {{title}}` and allows a manual override.
3. Sends the current note content and stored GitHub file SHA to update the same remote path.
4. Stores the newly returned remote file SHA, new local content hash, URL when available, timestamp, and `published` status after success.

GitHub requires the blob SHA of the file being replaced for an update. If the SHA is stale or the request otherwise fails, Squido preserves the previous last-successful metadata and reports the failure. Silent conflict resolution is not part of the alpha.

## Automation boundary

Publishing and republishing are manual in `0.1.0-alpha`. Optional auto-republish belongs to `0.5.0-alpha` or later and must include:

- off-by-default behavior
- explicit warnings about sending note content automatically
- granular controls for triggers and affected notes
- a dry-run mode

Manual token authentication remains the alpha authentication model. Device Flow/OAuth is planned separately after the core lifecycle is reliable.
