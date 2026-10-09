# Squido GitHub connection — approved onboarding reference

**Status:** Approved UX direction; implementation pending. Preserve this mobile-friendly, tappable two-card selector in an Obsidian Welcome / Setup tab, not a modal. Native Obsidian styling and keyboard accessibility; remember selection, offer switch/revoke in Settings.

## Welcome to Squido
Publish your Obsidian notes directly to GitHub. Choose how you'd like to connect your account.

### [Selectable card] Connect with GitHub
Managed authorization, short-lived tokens, easier setup and revocation.

**When selected — GitHub App connection**
Squido uses its authorization broker to request temporary GitHub credentials. Your note content is sent directly to GitHub, never through Squido's servers.

### [Selectable card] Use my own token
No Squido server involvement. You manage your own GitHub PAT and its expiration.

**When selected — Personal access token**
Create a fine-grained PAT limited to your selected repositories. Squido stores it using Obsidian SecretStorage and sends publishing requests directly to GitHub.

## Interaction specification
Two full-width, stacked rounded cards on narrow/mobile screens; each card is entirely tappable; selected state uses clear border and check indicator; explanatory panel below changes with selection. Use Obsidian native components/CSS variables, responsive widths, accessible focus/keyboard and screen-reader labels. Show setup instructions in an Obsidian workspace tab; do not open an interruptive modal. No real secrets in screenshots, fixtures, or docs.

## Security and operational requirements
- GitHub App broker mode and PAT-only mode must both work independently; never silently route PAT through broker.
- PAT mode uses fine-grained GitHub PAT, selected repositories, minimal verified permissions (likely Contents read/write for publishing; verify actual calls), explicit expiration/revocation guidance.
- Persist PAT or persistent broker grant through Obsidian SecretStorage / SecretComponent; settings contain reference ID only. GitHub installation tokens stay memory-only.
- Do not promise SecretStorage is encrypted at rest without verifying platform/version; Obsidian documents shared named secrets and earlier reports flagged plaintext local storage. Do not claim per-plugin isolation.
- Explain community-plugin shared-runtime risk, minimal scopes, revocation, and that publishing content travels directly to GitHub.
- Never claim absolute security; test macOS and iOS.
- No automatic merges/deployments. Implement via reviewable PR.

## Source
Approved from interactive ChatGPT selector discussion, 2026-10-09. Related Linear: DEL-88 (SecretStorage), DEL-66 (broker concurrency).