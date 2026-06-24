# Contributing to Squido

Squido is deliberately narrow. Contributions should make publishing selected notes to GitHub safer, clearer, or more reliable without turning the plugin into a CMS, navigation system, note router, or digital garden platform.

## Before opening a change

- Check the roadmap milestone that owns the behavior.
- Keep `0.1.0-alpha` changes limited to the core publishing MVP.
- Prefer public APIs and events for integrations; do not import Lighthouse or Note Actions internals.
- Keep dependencies minimal and explain any new runtime dependency.
- Do not write publish state to frontmatter unless an explicitly planned option calls for it.

## Development workflow

1. Create a focused branch.
2. Install dependencies with `pnpm install`.
3. Make a small, readable change with strict TypeScript types.
4. Run `pnpm run typecheck` and `pnpm run build`.
5. Test the affected workflow in an Obsidian vault using a disposable GitHub repository or branch.
6. Open a pull request describing the behavior, manual test, and any security implications.

Never commit GitHub tokens, vault content, plugin `data.json`, or generated `main.js` bundles.

