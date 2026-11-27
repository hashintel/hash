# Petrinaut

Visual editor for Stochastic Dynamic Colored Petri Nets (SDCPN). Published npm package (`@hashintel/petrinaut`).

## Stack

- React 19 with React Compiler (oxc-transform-react)
- TypeScript (type-checked with `tsc`)
- Vite 8 + Rolldown (library build)
- Panda CSS for styling
- oxlint for linting
- vitest for testing

## React Compiler

React Compiler is enabled: it automatically memoizes components and hooks.

**Do not use `useMemo`, `useCallback`, or `React.memo` unless there is a specific reason the compiler cannot handle it.** The compiler makes manual memoization unnecessary in the vast majority of cases.

When code is incompatible (e.g. writing to refs during render), opt out with:

```ts
function useMyHook() {
  "use no memo"; // <reason why>
  // ...
}
```

Compiler errors fail the build unless the function opts out. The options are in [`vite.config.ts`](./vite.config.ts). `yarn lint:eslint` reports them without a build, as oxlint's native `react/*` compiler rules. oxlint also reports bailouts inside opted-out functions, which the build skips; suppress those with the reason.

## Commands

```sh
yarn dev              # Storybook on port 6006
yarn build            # Library build
yarn lint:eslint      # Lint with oxlint
yarn lint:tsc         # Type check with tsc
yarn test:unit        # Unit tests (vitest)
```

## Conventions

- Function components only (no class components except error boundaries)
- `use()` for context consumption (React 19), not `useContext()`
- Styles via Panda CSS (`css()`, `cva()` from `@hashintel/ds-helpers/css`)
- No `@local/*` imports: this is a published package
- The interface font is the `body` token and monospaced text uses the `mono` token. They default to the system fonts and follow `--salt-font-body` and `--salt-font-mono`. The Monaco editor is the exception: it uses the bundled JetBrains Mono, named by `CODE_FONT_FAMILY` in `src/ui/shared/fonts.ts`. HASH's brand typefaces (`@local/brand-fonts`) are loaded by `.storybook/preview.tsx` and by `apps/petrinaut-website` only: their license forbids publishing them, and the library build embeds any font that `src` imports in `dist/main.css`
- Prefix unused parameters with `_`

## User-facing docs

The Petrinaut user guide lives at `docs/*.md` and is the source of truth for end-user behaviour. The in-app AI assistant reads these pages at runtime via the `readPetrinautDoc` tool, so stale docs lead directly to wrong advice in the product.

When you change UI or behaviour in `petrinaut` or `petrinaut-core`, you MUST:

1. Review the user-facing docs that mention the affected feature and update them in the same change.
2. If you add a brand-new user-facing surface (panel, view, mode, tool, settings dialog, ...), add a corresponding page and link it from `docs/README.md`.
3. When you add a new doc page, also register it in `petrinautDocNames` and `petrinautDocSummaries` in `libs/@hashintel/petrinaut-core/src/ai.ts`, and add a `?raw` import in `src/ui/petrinaut-docs-content.ts`. The tests in `libs/@hashintel/petrinaut-core/src/ai.test.ts` and `petrinaut-docs-content.test.ts` enforce that every enum value has a summary and a content entry.
4. Keep the docs end-user-focused: describe what the user sees, what they click, what happens. Do not document Storybook, internal modules, or test setup in the user guide.
5. If UI changes may make screenshots in the docs outdated, prompt the user to replace the screenshots.

If a change ships without doc updates, call that out in your summary so the user can decide whether to follow up.

## Architecture docs

The architecture docs describe the shape of the code. They are generated from annotations in the source by `archinaut`, configured in `apps/petrinaut-docs`, and the check fails when an annotation and the code disagree.

The architecture is declared **next to the code it describes**, never in a central mapping file. Three tags are the whole vocabulary:

- `@layerRoot <id>` plus `@role <one line>` in a doc comment on a folder's primary file declares a layer. Prefer this: it needs no new file.
- A folder's `README.md` frontmatter (`layer` and `role`) does the same, and the prose below becomes that layer's page. Use it when the folder has real prose to carry, or when no single file is the obvious host.
- `@talksTo <layer-id> via <protocol>` in any scanned doc comment or docstring declares an edge no import produces, such as Python sources loaded into Pyodide or a postMessage channel. The declaring file's own layer is the edge source; the build fails on an unknown target or on a pair the imports already prove.
- Files with no annotation inherit from the nearest declaring ancestor. Do not annotate every file.

Any other tag is ignored. In a declaring README's frontmatter, `layer` and `role` are the only keys and anything else fails the build.

The generated docs are **build output and are not committed**. Only the annotations are versioned.

When you change structure in `petrinaut-core` or `petrinaut`, you MUST add a declaration if you introduce a folder that is a new architectural unit: a new boundary or a distinct responsibility. A directory alone is no unit.

Verify with `yarn workspace @apps/petrinaut-docs lint:arch-docs`. To read the docs, `turbo run doc:architecture --filter @apps/petrinaut-docs` writes the bundle to `apps/petrinaut-docs/bundle/` (git-ignored). Full reference: `libs/@local/archinaut/README.md`. Browse with `turbo run dev --filter @apps/petrinaut-docs`.

A hand-written guide about a layer is an `.mdx` file beside that layer's code, in the folder that declares the layer or beneath it, with `title`, `description` and `sidebar_order` in its frontmatter; pages about the docs themselves stay under `apps/petrinaut-docs/content/`. Link with `[text](layer:core.simulation.engine)` or `[text](doc:core.simulation.engine/stepping)`; an unresolved target fails CI. Write a formula between `$` signs: KaTeX renders it when the site builds, and a formula it cannot parse fails that build, which `lint:arch-docs` does not run.

A layer guide follows the template in `apps/petrinaut-docs/content/maintaining/writing-a-guide.mdx`: the first sentence defines the layer, one D2 diagram sits beside the page, and each rule names its reason and the check that holds it. Its Interface section names what other blocks import, as names or as files; beyond that it lists no files, and it names no counts, dates or tickets. A layer that owns a worker channel or a context contract states it in a Protocol section, or in a `protocol.mdx` beside the file that defines the messages. `apps/petrinaut-docs/content/building-blocks.mdx` has one row per block with its layer, folder, interface files, protocol and guide: add or change the row when a block is added, renamed or given a guide. The rules for where a UI file goes and what a `.tsx` file may export are in `src/ui/ui-layer.mdx`; read it before adding a component, a sub-view or a context.

## Shipping conventions

These apply to changes in `petrinaut` and `petrinaut-core`.

- Changesets: `@hashintel/petrinaut` and `@hashintel/petrinaut-core` always get a `patch` bump, never `minor`, whatever the change. Write one changeset per affected package, each describing only that package's consumer-facing changes; pure refactors get none. `@local/*` and `@apps/*` packages never publish.
- Review fixes and scope additions land as dedicated commits on an open PR.
- Never commit `mise.lock` changes or generated arch-docs output. Stage explicit paths, not `git add -A`.
- Diagrams in Petrinaut documentation are D2. A guide's diagram sits beside the guide; one that a page under `apps/petrinaut-docs/content/` uses, or that several pages share, sits in `apps/petrinaut-docs/content/diagrams/`. Design and performance write-ups live in that package's `content/` tree, not in loose package `.md` files. A documented flaw that needs a refactor gets a `:::danger` aside and a Linear ticket.
- READMEs and docs state what a package does. No people, no meeting history, no volatile counts, no infrastructure or access-control detail.
- CI: Bench-CI is non-blocking. The playwright `types-page.spec.ts` check is flaky; rerun it once before diagnosing the diff. The "Vercel – petrinaut-docs" check can fail for Vercel-side reasons while the Actions build of the same docs passes; compare both before blaming the change.
