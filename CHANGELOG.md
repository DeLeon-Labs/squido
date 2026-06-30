# Changelog

All notable changes to Squido will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses prerelease versions while the publishing model is experimental.

## [Unreleased]

### Changed

- Pivoted the strategic authentication roadmap from Device Flow to GitHub App installation.
- Added GitHub App callback/setup planning before auth implementation.
- Reconciled Connection and Destination terminology across planning docs.
- Added a Connection Integration milestone between auth broker planning and Destination-Based Publishing.
- Added destination-based publishing planning for the next major milestone.
- Added planning for multiple GitHub destinations under one connection, destination publish modes, and non-publishing Rules.
- Generalized illustrative destination examples and auth callback language for public architecture docs.
- Added GitHub Markdown import workflow planning.
- Documented the first-publish, local-change detection, and republish lifecycle.
- Expanded the planned manifest contract to include destination identity and the GitHub file SHA.
- Clarified generated publish/update messages and later auto-republish safeguards.

## [0.1.0-alpha] - 2026-06-24

### Added

- Initial TypeScript Obsidian plugin scaffold.
- Current-note publishing through the GitHub Contents API.
- Publish command, ribbon action, confirmation modal, and commit message template.
- Single GitHub destination settings.
- Local publish manifest with hashes, timestamps, destination paths, URLs, and statuses.
- Rename, move, delete, and modify event handling for tracked Markdown notes.
- Current-note publish status indicator.
- Initial project, security, manifest, and architecture documentation.

[Unreleased]: https://github.com/DeLeon-Labs/squido/compare/0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/DeLeon-Labs/squido/releases/tag/0.1.0-alpha
