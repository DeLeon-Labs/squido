# Security

This is the concise Squido security checklist. [GitHub App authentication architecture](github-app-auth-architecture.md) is the canonical public source for trust boundaries, lifecycle, storage, token scope, revocation/rotation, content-blindness, and failure behavior. [Authentication](authentication.md) covers user-facing setup and local credential storage.

## Current alpha

- Manual PAT publishing remains an explicit **Advanced** fallback.
- The manual PAT and current broker grant are stored in Obsidian plugin data, not OS secure storage.
- Use a fine-grained PAT restricted to the destination repository with only the Contents permission needed to write files.
- Do not share or commit Squido `data.json`.
- Treat vault backups and synced Obsidian configuration as sensitive when they include plugin data.
- Broker grants are sensitive session artifacts even though they are not GitHub tokens. Broker-side hashing, device binding, expiration, revocation, and rotation limit their usefulness after invalidation.

## GitHub App path

- GitHub owns installation and repository permissions; clients cannot use the broker to broaden them.
- The only implemented token purpose is `repo_discovery`, fixed to `metadata: read`.
- Squido does not yet call the token endpoint, discover repositories, provide pickers, or publish with GitHub App credentials.
- GitHub App private keys, broker secrets, provider client secrets, GitHub tokens, and reusable grants must never be logged.
- Credential-bearing responses must use `Cache-Control: no-store`.
- GitHub installation tokens are short-lived, held in memory only, and never persisted by Squido or the broker.
- Cloudflare KV stores authentication records but is not used as a distributed lock. A SQLite-backed Durable Object is the coordinated serialization boundary for token vending.
- Uncertain cross-system token-creation failures fail closed.

## Content boundary

The broker is authentication infrastructure and remains content-blind. It must never receive note content, vault paths, repository file contents, publishing manifests, destinations, bindings, publishing decisions, or Lighthouse state.

Squido sends publishing content directly to the configured GitHub API destination after a user decision and with appropriate authorization.

## Publishing safety

- Before each publish or republish, Squido presents a confirmation modal and an editable generated message.
- Squido does not auto-publish, publish folders, or send note content to any service other than the configured GitHub API endpoint in the alpha.
- Future Rules may suggest or select destinations, but must not auto-publish unless the user explicitly enables that later behavior.
- Optional auto-republish remains later work and requires explicit warnings and granular controls.

Public documentation intentionally omits production secrets and IDs, undocumented production endpoints, internal coordination keys, exact reservation timings, sensitive logs, recovery commands, and exploit reproduction instructions.
