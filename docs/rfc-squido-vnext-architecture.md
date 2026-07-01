# RFC: Squido vNext Architecture

Status: Historical planning reference
Scope: Architecture and product model only; no implementation requirements are implied until follow-up issues are accepted.

This RFC is not the canonical source for current decisions. Use the focused docs for current architecture:

- [Authentication](authentication.md)
- [Security](security.md)
- [Publishing lifecycle](publishing-lifecycle.md)
- [Publish manifest](publish-manifest.md)
- [Connections and destinations](destinations.md)
- [Roadmap](../ROADMAP.md)

## 1. Product philosophy

Squido is a content synchronization and publishing bridge between Obsidian and canonical published content stored in GitHub.

The user owns the content. Obsidian is the editing surface. GitHub is the canonical published content store. Squido does not own, host, transform into a CMS, or become the system of record for user content.

Squido's job is narrow:

- connect an Obsidian source note to a publishing destination through a trusted provider connection
- publish explicit user-selected content
- track enough state to safely update that published content
- detect when local and remote state no longer line up
- expose integration points later without coupling to unrelated plugins

Squido intentionally does not:

- generate a site
- manage navigation
- model content types
- move notes through vault workflows
- become a digital garden platform
- own long-term content storage
- proxy note content through broker infrastructure

The product should feel like:

```text
Obsidian note -> Squido binding -> Destination -> GitHub published Markdown
```

GitHub is first because it gives Squido a durable published-content store, versioned remote files, selected-repository access through GitHub App installation, and conflict primitives such as file SHA.

## 2. Core concepts

### Source

A source is the local content Squido can publish or import.

For the initial product, a source is an Obsidian Markdown file:

- vault-relative path
- file basename/title
- current content hash
- optional Obsidian metadata

The source remains owned by the user in Obsidian. Squido can observe and publish it, but it does not become the source of truth.

### Connection

A connection represents authenticated access to an external provider account or organization.

For GitHub, a connection includes:

- provider: `github`
- account or organization context
- GitHub App installation identity
- authenticated account metadata
- accessible repositories limited by granted permissions
- revocation or permission-loss status

Connections answer: "What is Squido allowed to access?"

Connections do not define the publishing path. Destinations do that.

### Destination

A destination is a configured publishing target.

For GitHub, a destination includes:

- destination UUID
- display name
- connection UUID
- provider: `github`
- owner or organization
- repository
- branch
- folder/path prefix
- publish mode
- URL resolver or published URL pattern
- future metadata/schema settings

A destination belongs to a connection and saves the publishing settings Squido uses for publish/import workflows. A user may have multiple GitHub destinations under one GitHub connection, such as `Publication Log`, `Articles`, or `Documentation content`.

Initial publish modes:

- `file`: create or update one remote file per source note.
- `append`: append source content to a configured remote file.

Later publish modes:

- `index`: generate or update index/list files.
- `pr`: publish through pull requests.
- `archive`: archive published content through explicit user action.

Examples:

- `Publication Log` appends selected notes or entries to `/published/publication-log.md`.
- `Articles` publishes individual notes to `/published/articles/{{slug}}.md`.
- `Documentation content` publishes notes to a static-site Markdown content folder.

### Binding

A binding links one source to one destination.

The binding is Squido's local memory of the relationship:

- source UUID
- source vault path
- connection UUID through the destination
- destination UUID
- remote path
- last known GitHub file SHA
- last published local content hash
- last published timestamp
- publish state
- published URL when available

Bindings let Squido answer: "Has this local note changed since it was last published to this specific destination?"

### Publish

Publish is an explicit user action that sends the current source content to a destination.

### Rule

A Rule suggests or auto-selects destinations based on source metadata or location. It may preselect a destination and explain why it matched, but it must not auto-publish unless the user explicitly enables auto-publish in a later automation milestone.

Rule inputs:

- folder path
- tag
- frontmatter property
- filename pattern
- active Lighthouse Focus later, not now

Publish has two modes:

- first publish creates the remote file and binding
- update publish modifies an existing remote file using the last known remote SHA

Publishing is not sync. Publishing is directional from Obsidian to the destination unless a specific import/sync flow is invoked.

### Import

Import brings existing remote content into Obsidian and creates a local binding.

Import is needed when:

- a user already has Markdown in a GitHub repository
- Squido is installed after content already exists remotely
- a remote published note should become an Obsidian source note

Import should create a local note, compute its local hash, record the remote path/SHA, and mark the binding as published or imported-clean.

The GitHub-specific import UX is detailed in [github-import-workflow.md](github-import-workflow.md).

### Sync

Sync is bidirectional reconciliation between source and destination.

Sync is future work. Squido should not silently sync in the initial architecture because it must handle conflicts, deletes, renames, and user intent. Until sync is explicitly implemented, Squido should prefer explicit publish/import operations.

### Conflict

A conflict occurs when Squido cannot safely prove that its local operation is based on the current remote state.

Common cases:

- local note changed after last publish
- remote file changed since last known SHA
- remote file was deleted
- remote path now points to different content
- local binding path changed and the target path is ambiguous

Conflict handling should be conservative: detect, explain, and ask for user direction. Squido should not silently overwrite remote changes.

## 3. Publish lifecycle

### Lifecycle overview

```text
Remote Markdown? --import--> Source note + Binding
                         |
                         v
                  User edits in Obsidian
                         |
                         v
                 Squido detects local hash change
                         |
                         v
                 User publishes to Destination
                         |
                         v
          GitHub accepts create/update using remote SHA
                         |
                         v
             Binding records new SHA/hash/status/URL
```

### Import

Import creates or connects a source note from remote content.

Expected behavior:

1. User selects a GitHub destination and remote path.
2. Squido reads the remote file content and SHA.
3. Squido creates or updates a local Obsidian Markdown file according to explicit user choice.
4. Squido records a binding with the remote path, remote SHA, local content hash, and clean publish state.

Import must not overwrite a local note without confirmation.

### Edit

Edit happens in Obsidian. Squido observes local file events and status checks.

Expected behavior:

1. User edits a bound note.
2. Squido computes the current content hash.
3. If the current hash differs from the binding's last published hash, Squido marks the binding as changed.

Edit does not send content anywhere by itself.

### Publish

Publish sends a source to a destination.

Expected behavior:

1. User chooses Publish for a source/destination pair.
2. Squido resolves the binding and target remote path.
3. Squido checks local state against binding state.
4. Squido fetches or validates remote SHA when needed.
5. Squido creates or updates the GitHub file.
6. Squido records the resulting SHA, local hash, timestamp, URL, and publish state.

### Conflict detection

Conflict detection protects both local work and remote work.

For GitHub, the remote SHA is the primary concurrency token. Updating a remote file requires the SHA of the file being replaced. If Squido's stored SHA is stale, GitHub will reject or fail the update path; Squido should report this as a conflict instead of overwriting.

Conflict states should include:

- `localChanged`: local source changed since last publish
- `remoteChanged`: remote SHA differs from binding SHA
- `remoteDeleted`: remote file no longer exists
- `pathConflict`: target remote path exists but is not the bound file
- `deletedLocal`: local source no longer exists

### Remote update

Remote update is the successful publish/update path.

Expected behavior:

1. Squido sends content to GitHub with the required remote SHA for updates.
2. GitHub returns the new file metadata.
3. Squido stores the new SHA and local hash atomically with the binding update.
4. Squido marks the binding clean/published.

If the remote update fails, Squido preserves the last successful binding metadata.

## 4. Data model

The exact schema can evolve, but vNext should separate connections, destinations, sources, and bindings.

### Connections

```ts
interface Connection {
  id: string; // UUID
  provider: "github";
  accountLogin: string;
  accountType: "user" | "organization";
  installationId?: string;
  authMode: "github-app" | "manual-pat";
  status: "connected" | "revoked" | "needsReview" | "error";
  createdAt: string;
  updatedAt: string;
}
```

Connection records are trust and access records. They should not contain GitHub App private keys or broad long-lived credentials.

### Destinations

```ts
interface Destination {
  id: string; // UUID
  connectionId: string;
  name: string;
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  pathPrefix: string;
  publishMode: "file" | "append";
  appendFilePath?: string;
  urlTemplate?: string;
  createdAt: string;
  updatedAt: string;
}
```

Destination records are publishing configuration. They reference a connection for access.

`file` mode derives or stores a remote path per source/binding. `append` mode targets a configured remote file and appends selected source content to that file. Future modes such as `index`, `pr`, and `archive` should not be added until the core destination and conflict model is stable.

### Rules

```ts
interface Rule {
  id: string; // UUID
  name: string;
  destinationId: string;
  enabled: boolean;
  inputs: RuleInput[];
  behavior: "suggest" | "autoSelect";
}

type RuleInput =
  | { type: "folder"; path: string }
  | { type: "tag"; tag: string }
  | { type: "frontmatter"; property: string; value?: string | boolean | number }
  | { type: "filename"; pattern: string };
```

Rules are not automation by default. They may suggest or auto-select destinations, but they must not publish content unless a later explicit auto-publish setting is enabled by the user.

### Local sources

```ts
interface Source {
  id: string; // UUID
  type: "obsidian-file";
  vaultPath: string;
  title: string;
  currentHash?: string;
}
```

Source UUIDs let Squido survive renames better than path-only tracking. The vault path remains important for locating the note, but it should not be the only identity.

### Local bindings

```ts
interface Binding {
  id: string; // UUID
  sourceId: string;
  destinationId: string;
  sourcePath: string;
  remotePath: string;
  remoteSha?: string;
  lastPublishedHash?: string;
  lastPublishedAt?: string;
  publishedUrl?: string;
  state: PublishState;
}
```

Bindings are per source and per destination. One note may be published to multiple destinations, and each destination needs independent remote path, SHA, URL, and status.

### Publish state

```ts
type PublishState =
  | "unpublished"
  | "imported"
  | "published"
  | "localChanged"
  | "remoteChanged"
  | "conflict"
  | "deletedLocal"
  | "deletedRemote"
  | "error";
```

Publish state should be derived where possible and stored where it prevents expensive repeated checks or records the last known remote condition.

### Identity and path rules

UUIDs are internal Squido IDs. Paths are mutable user-facing locations.

```text
Source UUID -> current vault path
Connection UUID -> provider account/org access
Destination UUID -> connection + GitHub repo/branch/path prefix
Binding UUID -> source/destination relationship
Binding remotePath -> exact published file path
Binding remoteSha -> last known GitHub file identity/version
```

This avoids the common failure mode where a rename changes the only identifier Squido has.

## 5. Architecture relationships

```text
┌────────────────────┐
│ Obsidian vault      │
│ Source Markdown     │
└─────────┬──────────┘
          │ read/edit events
          v
┌────────────────────┐
│ Squido plugin       │
│ Sources/Bindings    │
│ Publish lifecycle   │
└──────┬─────────┬───┘
       │         │
       │         │ auth/session metadata
       │         v
       │  ┌────────────────────┐
       │  │ Squido auth broker  │
       │  │ GitHub App tokens   │
       │  └─────────┬──────────┘
       │            │ short-lived installation token
       v            v
┌────────────────────────────────────┐
│ GitHub destination                  │
│ Repo / branch / remote Markdown     │
└────────────────────────────────────┘
```

The auth broker is not a content pipeline. Its role is GitHub App installation and token exchange. Note content should move directly between Obsidian/Squido and GitHub.

## 6. Future concepts

### Destination adapters

Destination adapters isolate provider-specific publishing behavior.

Initial adapter:

- GitHub repository adapter

Possible future adapters:

- GitLab
- Forgejo
- Gitea
- Ghost
- WordPress

Each adapter must define:

- auth requirements
- destination configuration fields
- create/update/delete behavior
- conflict token model
- URL handling
- import support

Adapters should not force Squido into a CMS model. They publish selected content to configured destinations.

### Source adapters

Source adapters define where content comes from.

Initial adapter:

- Obsidian Markdown file

Possible future adapters:

- Obsidian folder selection
- Obsidian Bases/View-derived selections
- external Markdown import

Source adapters should preserve Obsidian as the user's editing surface unless a future product decision explicitly expands the model.

### Lighthouse integration

Lighthouse should remain optional and use public APIs/events.

Possible future integration points:

- expose publish status for Lighthouse views
- let Lighthouse filter notes by publish state
- trigger Squido publish from Lighthouse actions
- surface destination/binding metadata in a read-only way

Squido must not depend on Lighthouse internals, and Lighthouse must not reach into Squido's private stores.

## 7. Open questions

- Should source UUIDs be stored only in Squido data, or optionally written to frontmatter for portability?
- How much remote state should Squido validate before every publish versus on demand?
- Should import create a new note by default or bind to an existing local note by default?
- Should remote deletes be represented as conflicts, actions, or separate publish states?
- How should multiple destinations handle different filename/path conventions?
- How should append mode represent source boundaries, timestamps, and duplicate prevention?
- Should Rules live globally, per connection, or per destination?
- How should user-facing Rule explanations be shown before publish?
- How long should short-lived installation tokens be cached locally, if at all?

## 8. Non-goals for vNext

- Site generation
- Navigation generation
- CMS-style content modeling
- Automatic bidirectional sync
- Auto-publish
- Silent conflict resolution
- Lighthouse implementation
- Non-GitHub providers
- Broker-mediated note content publishing
