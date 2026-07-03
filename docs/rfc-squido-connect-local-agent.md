# Squido Connect Local Agent RFC

Squido Connect is a future part of the Squido ecosystem.

It acts as the core authentication engine for Squido apps and may eventually provide a secure authentication API for other Obsidian plugins.

## Core idea

Squido Connect runs as a Mac-first background service with a lightweight GUI for connecting publishing services securely.

It stores sensitive authentication material in device secure storage, such as macOS Keychain, so Obsidian plugins do not need to store broker grants, tokens, or API keys in plaintext plugin data.

## Purpose

- Provide secure authentication for Squido Publish
- Support GitHub first, with room for other publishing providers later
- Reduce credential handling inside Obsidian plugins
- Allow plugins to request provider access without owning authentication directly
- Create a shared local trust layer for the Squido ecosystem

## Architecture

- Squido Connect owns authentication and secure storage
- Squido Publish becomes an Obsidian UI/client layer
- The Obsidian plugin communicates with Squido Connect through a local API
- The remote auth broker still handles GitHub App private-key operations when needed
- Provider tokens should remain short-lived and not be persisted unnecessarily

## Platform direction

Mac first.

Mobile later.

Mobile may eventually connect to the user's Mac through Tailscale or a similar trusted private network, similar to using the ChatGPT app to communicate with a Codex session running on the Mac.

## Future possibility

Squido Connect could expose a secure local API for other Obsidian plugin developers so they can add publishing or provider functionality without handling authentication themselves.

## Open questions

- How does the local API authenticate trusted plugins?
- Should Squido Connect run as a menu bar app, background service, or both?
- How should mobile connect safely to the Mac agent?
- What provider permissions should be exposed to third-party plugins?
- How much of this belongs in Squido v1 versus future architecture?
