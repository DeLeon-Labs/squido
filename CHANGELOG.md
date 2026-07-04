# Changelog

All notable changes to Squido will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses prerelease versions while the publishing model is experimental.

## [Unreleased]

### Changed

- Bumped the development build version to `0.2.7-alpha.1` for the stale pending-state fix.
- Bumped the development build version to `0.2.7-alpha` for Squido-side broker grant hardening.
- Added generated GitHub App device/session identity on the Squido side for future broker grant binding.
- Added device/session id to broker start, verification, and revocation requests.
- Added broker grant revocation attempt on GitHub App disconnect while preserving local disconnect behavior.
- Added support for broker grant rotation and expired/revoked verification responses.
- Fixed stale pending GitHub App connection state so missing or invalid expiration metadata becomes expired instead of leaving Connect GitHub disabled indefinitely.
- Inserted broker-grant hardening as the next connection milestone before token vending, repository picker calls, or GitHub App credentialed publishing.
- Clarified that current alpha broker grants are durable local session artifacts until broker-side expiration, revocation, device/session binding, and rotation are implemented.
- Bumped the development build version to `0.2.6-alpha` for the modular architecture cleanup milestone.
- Modularized source ownership for GitHub App connection orchestration, settings sections, credential storage seam, build diagnostics, and manifest storage without changing runtime behavior.
- Bumped the development build version to `0.2.2-alpha.2` for broker-grant connection verification.
- Added stored broker-grant verification so an existing GitHub App connection can be refreshed without reopening GitHub.
- Documented broker-grant reconnect behavior as the reliable already-installed GitHub App path.
- Bumped the development build version to `0.2.2-alpha.1` for GitHub App connection UI state fixes.
- Improved GitHub App connection Settings UI with status indicators, connected-button disabling, clearer pending/expired/failed feedback, and connected metadata display.
- Added mobile-friendly pending connection recovery with foreground status refresh, manual status check, and reopen-GitHub controls.
- Clarified already-installed GitHub App behavior when GitHub does not redirect back to the broker setup URL.
- Bumped the development build version to `0.2.2-alpha` for the GitHub App Authentication MVP.
- Added a broker-backed GitHub App connection flow that starts installation, polls completion, and stores only non-sensitive connection metadata.
- Kept manual PAT publishing available as the explicit advanced/manual publishing path while GitHub App publishing remains future work.
- Bumped the development build version to `0.1.1-alpha` for the diagnostics workflow.
- Added generated non-release build diagnostics through `dist/build-info.json` and a collapsible Developer settings section.
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
