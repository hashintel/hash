# Petrinaut

Visual editor for Stochastic Dynamic Colored Petri Nets (SDCPN). Published npm package (`@hashintel/petrinaut`).

## Stack

- React 19 with React Compiler (oxc-transform-react)
- TypeScript (type-checked with `tsgo`)
- Vite 8 + Rolldown (library build + demo site)
- Panda CSS for styling
- oxlint for linting
- vitest for testing

## React Compiler

React Compiler is enabled — it automatically memoizes components and hooks.

**Do not use `useMemo`, `useCallback`, or `React.memo` unless there is a specific reason the compiler cannot handle it.** The compiler makes manual memoization unnecessary in the vast majority of cases.

When code is genuinely incompatible (e.g. writing to refs during render), opt out with:

```ts
function useMyHook() {
  "use no memo"; // <reason why>
  // ...
}
```

The compiler runs with `panicThreshold: "critical_errors"` — the build fails if it encounters critical errors not opted out via `"use no memo"`.

## Commands

```sh
yarn dev              # Dev server (demo site)
yarn build            # Library build
yarn lint:eslint      # Lint with oxlint
yarn lint:tsc         # Type check with tsgo
yarn test:unit        # Unit tests (vitest)
```

## Conventions

- Function components only (no class components except error boundaries)
- `use()` for context consumption (React 19), not `useContext()`
- Styles via Panda CSS (`css()`, `cva()` from `@hashintel/ds-helpers/css`)
- No `@local/*` imports — this is a published package
- Prefix unused parameters with `_`

## User-facing docs

The Petrinaut user guide lives at `docs/*.md` and is the source of truth for end-user behaviour. The in-app AI assistant reads these pages at runtime via the `readPetrinautDoc` tool, so stale docs lead directly to wrong advice in the product.

When you change UI or behaviour in `petrinaut` or `petrinaut-core`, you MUST:

1. Review the user-facing docs that mention the affected feature and update them in the same change.
2. If you add a brand-new user-facing surface (panel, view, mode, tool, settings dialog, ...), add a corresponding page and link it from `docs/README.md`.
3. When you add a new doc page, also register it in `petrinautDocNames` and `petrinautDocSummaries` in `libs/@hashintel/petrinaut-core/src/ai.ts`, and add a `?raw` import in `src/ui/views/Editor/panels/ai-assistant-panel/petrinaut-docs-content.ts`. The tests in `libs/@hashintel/petrinaut-core/src/ai.test.ts` and `petrinaut-docs-content.test.ts` enforce that every enum value has a summary and a content entry.
4. Keep the docs end-user-focused: describe what the user sees, what they click, what happens. Do not document Storybook, internal modules, or test setup in the user guide.
5. If UI changes may make screenshots in the docs outdated, prompt the user to replace the screenshots.

If a change ships without doc updates, call that out in your summary so the user can decide whether to follow up.

## Architecture docs

The architecture docs describe the shape of the code. They are generated from annotations in the source by `@local/petrinaut-arch-docs`, and building the bundle fails when they drift.

The architecture is declared **next to the code it describes** — never in a central mapping file. Three tags, and that is the whole vocabulary:

- `@layerRoot <id>` plus `@role <one line>` in a doc comment on a folder's primary file declares a layer. Prefer this — it needs no new file.
- A folder's `README.md` frontmatter (`layer` and `role`) does the same, and the prose below becomes that layer's page. Use it when the folder has real prose to carry, or when no single file is the obvious host.
- `@talksTo <layer-id> via <protocol>` in any scanned doc comment or docstring declares an edge no import produces, such as a spawned subprocess or a postMessage channel. The declaring file's own layer is the edge source; the build fails on an unknown target or on a pair the imports already prove.
- Files with no annotation inherit from the nearest declaring ancestor. Do not annotate every file.

Any other tag is ignored. In a declaring README's frontmatter, `layer` and `role` are the only keys and anything else fails the build.

The generated docs are **build output and are not committed**. Only the annotations are versioned.

When you change structure in `petrinaut-core`, `petrinaut`, or `petrinaut-cli`, you MUST add a declaration if you introduce a folder that is a new architectural unit — a new boundary or a distinct responsibility, not only a new directory.

Verify with `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`. To read the docs, `turbo run doc:architecture --filter @local/petrinaut-arch-docs` writes the bundle to `libs/@local/petrinaut-arch-docs/bundle/` (git-ignored). Full reference: `libs/@local/petrinaut-arch-docs/README.md`. Browse with `turbo run dev --filter @apps/petrinaut-docs`.

Hand-written MDX in `libs/@local/petrinaut-arch-docs/content/` is optional. Give such a page `attachTo: <layer id>` in its frontmatter. Link with `[text](layer:core.simulation.engine)` or `[text](doc:simulation/memory-model)`; relative paths break when a page's `attachTo` changes, and unresolved targets fail CI.
