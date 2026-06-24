# Squido roadmap

The roadmap keeps Squido focused on publishing notes and tracking publish state. Items belong to the milestone where they first become necessary; earlier releases should not pre-build later architecture.

## 0.1.0-alpha — Core publishing

- Publish current note to GitHub
- Single repo
- Single target folder
- Confirmation modal
- Commit message template
- Manifest tracking
- Detect unpublished changes
- Handle rename/move/delete/modify events

## 0.2.0-alpha — Publishing management

- Republish
- Unpublish
- Published URL tracking
- Open published note
- Improved status indicators

## 0.3.0-alpha — Folder publishing

- Publish folder
- Publish selected notes
- Batch publish
- Folder-level status

## 0.4.0-alpha — Rules engine

- Folder-based publishing
- Property-based publishing
- Conditions such as folder AND `publish:true`
- Optional frontmatter status writing

## 0.5.0-alpha — Automation

- Auto-publish on save
- Auto-publish on move
- Granular warnings
- Dry-run mode

## 0.6.0-alpha — Lighthouse integration hooks

- Expose publish status data through public API/event hooks
- Do not require Lighthouse
- Leave room for future Views/Bases-style integration

## 0.7.0-alpha — Note Actions integration

- Publish as part of workflow actions
- Publish after move/template/action
- No tight coupling

## 0.8.0-alpha — Multiple destinations

- Multiple GitHub repos
- Destination profiles
- Multiple target folders

## 0.9.0-alpha — Site awareness

- Validate remote files
- Detect conflicts
- Sync status checks

## 1.0.0 — Stable GitHub publishing

- Stabilize the GitHub publishing workflow and public extension surface
- Complete release, compatibility, and migration documentation

## 2.x — Additional Git platforms

- GitLab
- Forgejo
- Gitea
- Generic Git

## 3.x — Hosted publishing platforms

- Ghost
- WordPress
- Other APIs if worthwhile

