# @hashintel/ds-components

React components for HASH's design system, built with TypeScript, Ark UI, and PandaCSS.

## Ownership Model

As of the FE-612 ownership restructure:

- `@hashintel/ds-components` owns the Panda preset source, token/codegen scripts, and demo surfaces.
- `@hashintel/ds-helpers` is the generated Panda `styled-system` artifact.
- The old `@hashintel/ds-theme` surface has been folded into `@hashintel/ds-components/preset`.

For new internal work, treat `ds-components` as the source of truth.

## Public Entry Points

| Entry point                                           | Purpose                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@hashintel/ds-components`                            | Published component entrypoints from `src/components/*.tsx`                                                 |
| `@hashintel/ds-components/preset`                     | Panda preset helpers such as `preset`, `createPreset`, `scopedThemeConfig`, and `resolvePandaBuildInfoPath` |
| `@hashintel/ds-components/tokens`                     | Package-owned Panda token objects such as `tokens` and `semanticTokens`                                     |
| `@hashintel/ds-components/docs/mdx/<slug>.mdx`        | Raw MDX docs page per component — see [Published component docs](#published-component-docs-mdx)             |
| `@hashintel/ds-components/docs/blocks/<name>`         | Doc-block components the raw MDX pages import (`stage`, `props-table`, `do-dont-list`, …)                   |
| `@hashintel/ds-components/docs/rehype-markdown-class` | `rehypeMarkdownClass` — rehype plugin stamping `hash-md` on markdown-derived elements (see below)           |
| `@hashintel/ds-components/docs/panda.buildinfo.json`  | Panda build info covering the doc blocks' styles                                                            |

Component implementation still uses the generated Panda runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Box, Flex, Stack } from "@hashintel/ds-helpers/jsx";
```

Token lookup helpers and token types should still come from `@hashintel/ds-helpers/tokens`.
Use `@hashintel/ds-components/tokens` when you need the package-owned Panda token objects themselves.

## Package Layout

| Area                       | Location                         |
| -------------------------- | -------------------------------- |
| Components                 | `src/components/**`              |
| Panda preset source        | `src/preset.ts`, `src/preset/**` |
| Package token facade       | `src/tokens.ts`                  |
| Token and color generators | `scripts/**`                     |
| Stories                    | `src/components/*/*.stories.tsx` |
| Token demo stories         | `src/tokens/**`                  |
| Intro docs                 | `src/stories/Intro.mdx`          |
| Local demo config          | `panda.local.config.ts`          |
| Storybook harness          | `.storybook/**`                  |
| Snapshot tests             | `tests/**`                       |

## Common Commands

Run these from `libs/@hashintel/ds-components`:

```bash
yarn dev
yarn dev:lib
yarn codegen
yarn lint:eslint
yarn lint:tsc
yarn test:unit
yarn test:snapshots
yarn build
```

`yarn dev` is the primary Storybook-based review loop. Use `yarn dev:storybook` for component-story review and `yarn dev:lib` when you only need the library watcher.
`yarn prepare`/`yarn codegen` generates the shared `../ds-helpers/styled-system`
authoring runtime, and the demo loops rely on Vite/PostCSS for CSS extraction
while the server is running.

## Published Component Docs (MDX)

Each component's `src/components/*/*.docs.mdx` page is published as portable MDX at `dist/docs/mdx/<slug>.mdx` during `yarn build`, so an external documentation site with its own MDX pipeline (e.g. fumadocs) can render the design-system docs without Storybook. Per page: the `meta` is duplicated into YAML frontmatter (`title`, `description`, `alternativeNames`, `links`, `referenceLinks`, `related`); the Storybook-only `<Meta>` registration is stripped; the leading `# Title` heading and description paragraph are removed (frontmatter-driven sites render those themselves); each `<Stage>`'s Code tab source is baked in as a literal `code` attribute; and every import references a published entry point (`@hashintel/ds-components/<component>`, `@hashintel/ds-components/docs/blocks/<block>`), so the files work from any location. Copy or sync them into the site's content directory:

```sh
cp node_modules/@hashintel/ds-components/dist/docs/mdx/*.mdx content/docs/components/
```

The site's MDX pipeline then owns everything markdown: typography, TOC extraction, heading anchors, search indexing, and code-fence highlighting — the package ships **no markdown typography CSS**. The live component examples and doc blocks render as-is. Frontmatter fields beyond `title`/`description` surface by extending the site's frontmatter schema.

To scope its own markdown typography the way Storybook does, a site can add the published `rehypeMarkdownClass` rehype plugin to its MDX pipeline. It stamps a `hash-md` class on every element derived from markdown and leaves literal JSX — the live component examples and doc blocks — untouched, so a stylesheet keyed on `hash-md` styles prose without reaching into component content:

```ts
import { rehypeMarkdownClass } from "@hashintel/ds-components/docs/rehype-markdown-class";

// e.g. in a fumadocs source.config.ts / @mdx-js config
const mdxOptions = {
  rehypePlugins: [rehypeMarkdownClass],
};
```

```css
.hash-md:is(h1, h2, h3) {
  /* your prose styles; component content never matches */
}
```

The published pages are **React Server Components-compatible** (verified on fumadocs' default Next.js setup, where content MDX compiles as server modules): every published module carries `"use client"`; the pages' interactive demo components and data are extracted at build time into generated client modules (`@hashintel/ds-components/docs/demos/<slug>`); compound-component members (`Banner.Title`, `Dialog.Body`) are rewritten to flat bindings from a generated client module, since property access through a client reference does not resolve; and inline handlers use the serializable `noop` from `@hashintel/ds-components/noop`. The publish build fails on any construct that would break under RSC, so this holds as pages evolve.

### What the consuming site must provide

1. **Peer dependencies** — `react`/`react-dom` ^19; `@ark-ui/react` and `@hashintel/ds-helpers` are regular dependencies and install with the package.
2. **The design system's CSS**, generated with Panda from the package preset plus **both** shipped buildinfos: the main one covers the components rendered in the live examples, the docs one covers the doc blocks themselves (example stages, props tables, do/don't lists). With a `panda.config.ts` like the one below, `panda cssgen --outfile ds-docs.css` emits a stylesheet to load once globally.

   ```ts
   import { defineConfig } from "@pandacss/dev";

   import {
     preset,
     resolvePandaBuildInfoPath,
   } from "@hashintel/ds-components/preset";

   export default defineConfig({
     presets: [preset],
     importMap: "@hashintel/ds-helpers",
     include: [
       resolvePandaBuildInfoPath(
         "@hashintel/ds-components/panda.buildinfo.json",
         require.resolve,
       ),
       resolvePandaBuildInfoPath(
         "@hashintel/ds-components/docs/panda.buildinfo.json",
         require.resolve,
       ),
     ],
   });
   ```

3. **Fonts** — the preset's token stack expects Inter, Inter Tight, and Geist Mono (e.g. via `@fontsource-variable/inter`, `@fontsource-variable/inter-tight`, `@fontsource-variable/geist-mono`); without them the pages fall back to system fonts.
4. **Color scheme** — add a `light` or `dark` class to the root element to pin the theme; with neither class the preset follows the system preference.

## Contributor Docs

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current contributor workflow.
- See [SCRIPT_SURFACE_RECOMMENDATIONS.md](./SCRIPT_SURFACE_RECOMMENDATIONS.md) for the naming conventions applied here and proposed for sibling packages.
- See `AGENTS.md` for package-scoped implementation rules.

## External References

- [Ark UI documentation](https://ark-ui.com)
- [Ark UI MCP Server documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [PandaCSS documentation](https://panda-css.com)
