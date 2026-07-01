# GitHub Import Workflow

Status: Planning, not implemented
Depends on: GitHub App connection, repository picker, and destination model. Do not implement until those dependencies are accepted.

## Goal

Allow users to connect GitHub, create or choose a destination from accessible repositories, browse Markdown files, and import selected files into Obsidian while creating Squido bindings for future publish/update operations.

Import should make existing GitHub Markdown usable in Obsidian without turning Squido into a sync engine. The user remains in control of what enters the vault and how conflicts are resolved.

## Product principles

- GitHub is the canonical published content store.
- Obsidian is the editing surface.
- Import creates or connects local Obsidian sources from remote Markdown.
- Import must not overwrite local notes without explicit confirmation.
- Import should create bindings so future publish/update flows are safe.
- Import is not automatic bidirectional sync.

## First-run UX

The first-run flow should guide a user from no setup to a usable import path:

```text
Welcome to Squido
  -> Connect GitHub
  -> Choose account / organization
  -> Create GitHub connection
  -> Choose repository
  -> Choose branch
  -> Choose folder
  -> Browse Markdown
  -> Select files
  -> Choose local import location
  -> Review duplicates/conflicts
  -> Import
```

Recommended first-run states:

1. **Not connected**
   - Show **Connect GitHub**.
   - Explain that GitHub will grant selected-repository access through the Squido GitHub App.
   - Keep manual PAT fallback under **Advanced** only.

2. **Connected, no destination**
   - Show connected account/organization context.
   - Show repository picker filtered to connection-accessible repositories.
   - Save selected repo/branch/folder as a destination.

3. **Destination selected**
   - Show branch picker.
   - Show folder picker.
   - Show **Browse Markdown files**.

4. **Markdown selected**
   - Show local import destination inside the vault.
   - Show duplicate/conflict review.
   - Show **Import selected files**.

## Repo picker

The repo picker should list repositories available through the GitHub App connection.

Requirements:

- show account or organization owner
- show repository name
- show whether access is selected or pending
- handle empty installations
- handle organization approval/pending states
- avoid showing repositories outside the installation scope

Empty states:

- "Squido is connected but has no repository access."
- "Install Squido on a repository in GitHub, then refresh."
- "You may need an organization admin to approve access."

## Branch picker

The branch picker should load branches for the selected repository.

Defaults:

- use the repository default branch first
- allow explicit branch selection
- remember the selected branch in the destination

Failure states:

- repository not accessible
- branch was deleted
- token/session expired
- network failure

If the selected branch disappears, Squido should pause import/publish for that destination and ask the user to choose another branch.

## Folder picker

The folder picker should let the user choose the remote folder that contains publishable Markdown.

Behavior:

- root folder is allowed
- nested folders are allowed
- folder picker should show remote tree folders
- path field fallback is acceptable for alpha
- selected folder becomes the destination path prefix

Folder selection should not imply navigation ownership. Squido chooses where files are imported/published; it does not build site navigation.

## Markdown browser

The Markdown browser displays Markdown files under the selected repository, branch, and folder.

Recommended columns:

- file name
- remote path
- last remote SHA or abbreviated SHA
- existing local binding state
- duplicate/conflict indicator

Filtering:

- show `.md` and `.markdown`
- hide non-Markdown files by default
- optional search by filename/path
- optional "show already imported" toggle

Selection:

- single select for initial MVP
- multi-select for batch import if implementation cost is low
- select all can wait until batch import is stable

## Import flow

```text
User selects destination + remote Markdown
  -> Squido checks existing bindings
  -> Squido checks local duplicate paths
  -> User chooses local folder/path strategy
  -> Squido fetches remote content and SHA
  -> Squido writes local note
  -> Squido records Source + Destination + Binding
  -> Squido marks binding imported/published-clean
```

Import decisions:

- preserve remote filename by default
- allow local folder choice
- do not rewrite Markdown links in the first version
- do not import assets in the first version unless explicitly scoped
- do not overwrite local files without confirmation

Import result should show:

- created local note path
- remote path
- connection
- destination
- publish state
- any skipped files

## Duplicate detection

Duplicate detection should check three layers:

### Existing binding duplicate

Remote file is already bound to a local source.

Default action:

- show "Already imported"
- offer **Open local note**
- offer **Update local from remote** only if remote changed and update flow is implemented

### Local path duplicate

The target local path already exists but is not bound to the selected remote file.

Default action:

- do not overwrite
- offer:
  - choose another local path
  - bind to existing local note after preview
  - skip

### Content duplicate

Another local note has the same content hash but no binding.

Default action:

- warn but do not block
- offer bind/import choices

## Update flow

Update flow handles an already imported/bound remote file.

Expected states:

1. **Clean**
   - local hash matches binding hash
   - remote SHA matches binding SHA
   - no action needed

2. **Remote changed, local clean**
   - remote SHA differs
   - local hash still matches last imported/published hash
   - safe to update local note after confirmation

3. **Local changed, remote unchanged**
   - local hash differs
   - remote SHA matches
   - user can publish local changes or keep editing

4. **Both changed**
   - local hash differs
   - remote SHA differs
   - conflict; no automatic update

Update local from remote should:

- preview remote changes where practical
- preserve previous local content until user confirms
- update local file
- record new remote SHA and local hash
- mark binding clean

## Conflict cases

Squido should detect and explain conflicts without hiding the cause.

| Case | Detection | Default behavior |
| --- | --- | --- |
| Local file exists at import path | local path check | Ask user to choose bind, rename, skip, or overwrite after preview |
| Remote file already bound | binding remote path + destination match | Open existing local note or skip |
| Remote changed since binding | remote SHA differs | Mark `remoteChanged`; offer update or conflict review |
| Local changed since binding | local hash differs | Mark `localChanged`; offer publish |
| Both local and remote changed | local hash differs and remote SHA differs | Mark `conflict`; no automatic overwrite |
| Remote deleted | remote path 404 for bound file | Mark `deletedRemote`; offer unbind, recreate remote, or keep local |
| Local deleted | source path missing | Mark `deletedLocal`; offer re-import, unbind, or locate moved note |
| Remote path collision | target path exists with different SHA/binding | Mark `pathConflict`; require user decision |
| Permission revoked | GitHub App installation no longer grants repo access | Pause destination; ask user to reconnect/update installation |

Conflict resolution should be explicit. The first implementation can provide conservative options and defer full merge tooling.

## Binding created by import

Import should create the same durable relationship that publish creates.

Minimum binding fields:

- binding UUID
- source UUID
- destination UUID
- local vault path
- remote path
- remote SHA
- local content hash
- imported timestamp
- publish state: `imported` or `published`
- published URL when resolvable

Import should not depend on frontmatter. Optional frontmatter writing can remain a later setting.

## Suggested command/UI surface

Commands:

- `Squido: Import from GitHub`
- `Squido: Browse GitHub Markdown`

Settings/setup:

- Connect GitHub
- choose repository
- choose branch
- choose folder
- browse/import Markdown

Contextual actions:

- Open local note
- Import selected file
- Update local from remote
- Publish local changes
- Resolve conflict

## Non-goals for initial import

- automatic bidirectional sync
- background import
- asset/media import
- Markdown link rewriting
- merge editor
- folder-wide import without review
- Lighthouse integration
- non-GitHub imports

## Open questions

- Should import default to the same local folder as the remote folder, or ask every time?
- Should imported files preserve full remote path under a local root?
- Should Squido support binding a remote file to an existing local note as a first-class flow?
- Should remote Markdown frontmatter be preserved exactly or normalized later?
- Should import state be named `imported`, `published`, or `clean`?
- How much remote metadata should be cached for large folders?
