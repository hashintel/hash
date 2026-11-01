# @hashintel/ds-components - Agent Context

## Purpose

`@hashintel/ds-components` is now the source-owning design-system package.

It owns:

- the Panda preset source in `src/preset/**`
- token/codegen scripts in `scripts/**`
- the component library in `src/components/**`
- the token/demo surface in `src/tokens/**`, `.storybook/`, and `tests/**`

It still consumes the generated runtime styling utilities from `@hashintel/ds-helpers`.

## Architecture

```
┌─────────────────────────────────────┐
│           ds-components             │
│  preset source + scripts + demos    │
└──────────────────────┬──────────────┘
                       │
                       │ panda codegen
                       ▼
              ┌─────────────────┐
              │   ds-helpers    │
              │ generated only  │
              │ styled-system   │
              └────────┬────────┘
                       ▼
              css(), cva(), jsx runtime
```

Boundary rules:

- `ds-components` generates `../ds-helpers/styled-system` via Panda `outdir`.
- `ds-helpers` must not depend on `ds-components`.
- `@hashintel/ds-components/preset` is the canonical public styling entrypoint.
- `@hashintel/ds-components/tokens` is the public package-owned token export for `tokens` and `semanticTokens`.

## Panda CSS Configuration

### panda.config.ts

```ts
import { defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export default defineConfig({
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: ["./src/components/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outExtension: "mjs",
  preflight: false,
  presets: [preset],
  strictPropertyValues: true,
  strictTokens: true,
  validation: "error",
});
```

Key points:

- `src/preset.ts` is the local source of truth for the preset.
- publish codegen writes to `../ds-helpers/styled-system`
- `panda.local.config.ts` also writes to `../ds-helpers/styled-system`; it only broadens the scanned demo/story globs.
- `panda.local.config.ts` exists separately for local demo surfaces such as Storybook

### Token Naming Patterns (Strict Mode)

With `strictTokens: true`, you must use the exact token names:

| Token Type       | ❌ Invalid               | ✅ Valid                                     |
| ---------------- | ------------------------ | -------------------------------------------- |
| Spacing          | `spacing.4`, `default.4` | `"4"`, `"2"`, `"0.5"`                        |
| Radii            | `radius.2`, `md.2`       | `sm`, `md`, `lg`, `full`                     |
| FontSize         | `size.textsm`            | `xxs`, `xs`, `sm`, `base`, `lg`, `xl`, `2xl` |
| LineHeight       | `leading.none.textsm`    | `none.text-sm`, `normal.text-base`           |
| Arbitrary values | `64px`                   | `[64px]`                                     |

Spacing and radii are the standard Panda scales, runtime-scaled via `--density-factor` and `--roundness-factor` (see `src/preset/tokens.ts`).

Token types for stories and public token access should come from `@hashintel/ds-helpers/tokens`.

### Import Patterns

Component implementation continues to use the generated styling runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Box, Flex, Stack } from "@hashintel/ds-helpers/jsx";
```

When you need token lookup helpers or token types, use:

```ts
import { token, type Token } from "@hashintel/ds-helpers/tokens";
```

## Color Token Naming

### Static Colors

Opaque base colors with alpha scales (steps of 5):

```
black, black.a00–a125
white, white.a00–a125
```

### Palettes

Eight light/dark-aware palettes (generated into `src/preset/tokens/gen/colors/`), each with a solid (`s*`) and an alpha (`a*`) scale in steps of 5:

```
{neutral,blue,green,orange,red,yellow,pink,purple}.{s00–s125}
{neutral,blue,green,orange,red,yellow,pink,purple}.{a00–a125}
```

### Semantic Sets (`bg.*`, `bgSolid.*`, `fg.*`, `bd.*`)

Every palette carries a semantic set (`blue.fg.link`, `red.bd.solid`, …), and the same set exists at the root referencing `neutral` (`fg.muted`, `bg.surface`, …). The structure is built by `createSemanticSet` in `src/preset/tokens/utils.ts`.

The bare group name is the resting state (`fg.muted`); interaction states nest under it (`fg.muted.hover`).

**Backgrounds** — `bg.*` is alpha-based; `bgSolid.*` is the opaque equivalent:

```
bg.{min,surface,subtle,shaded,solid}.{hover,active,disabled}
bgSolid.{min,surface,subtle,shaded,solid}.{hover,active,disabled}
```

**Foregrounds (`fg.*`):**

```
fg.max
fg.heading
fg.onSolid                               # contrast color for solid backgrounds
fg.{body,muted,subtle}.{hover,disabled}
fg.link.{hover,active,disabled}
```

**Borders (`bd.*`):**

```
bd.{subtle,solid,strong}.{hover,active,disabled}
```

### Status Aliases

`status.{info,success,warning,error}` alias the blue/green/orange/red palettes respectively, scales and semantic sets included:

```
status.error.s90
status.warning.a30
status.info.a60
```

### colorPalette Switching

Recipes can defer the palette choice to Panda's `colorPalette` property:

```ts
css({
  colorPalette: "red",
  color: "colorPalette.s110",
  borderColor: "colorPalette.a60",
});
```

### Semantic Shadows

```
elevation.{drop,lift,raise,float}.{macro,micro}
```

## Component Patterns

### Recipe Definition

Components use `cva()` for variant-based styling:

```tsx
import { cva } from "@hashintel/ds-helpers/css";

const buttonRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    // ...base styles
  },
  variants: {
    variant: {
      solid: {},
      subtle: {},
      ghost: {},
    },
    tone: {
      neutral: {},
      brand: {},
      error: {},
    },
    size: {
      sm: { height: "[28px]", px: "2" },
      md: { height: "[32px]", px: "3" },
      lg: { height: "[40px]", px: "4" },
    },
  },
  compoundVariants: [
    {
      variant: "solid",
      tone: "brand",
      css: {
        backgroundColor: "blue.s90",
        color: "blue.s00",
        _hover: { backgroundColor: "blue.s85" },
      },
    },
  ],
});
```

### Ark UI Integration

Components wrap Ark UI primitives with Panda styling:

```tsx
import { Checkbox as ArkCheckbox } from "@ark-ui/react/checkbox";
import { css } from "@hashintel/ds-helpers/css";

export const Checkbox = (props) => (
  <ArkCheckbox.Root className={css({/* styles */})} {...props}>
    <ArkCheckbox.Control className={css({/* styles */})}>
      <ArkCheckbox.Indicator>{/* check icon */}</ArkCheckbox.Indicator>
    </ArkCheckbox.Control>
    <ArkCheckbox.Label>{props.children}</ArkCheckbox.Label>
  </ArkCheckbox.Root>
);
```

## Scripts

| Script                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `yarn dev`             | Start the primary Storybook-based demo loop                        |
| `yarn dev:lib`         | Watch the publishable component library build                      |
| `yarn codegen`         | Generate token source files and `../ds-helpers/styled-system`      |
| `yarn build`           | Build the component library entrypoints                            |
| `yarn build:storybook` | Build the Storybook demo surface                                   |
| `yarn lint:eslint`     | Lint the publishable package surface                               |
| `yarn lint:tsc`        | TypeScript type checking                                           |
| `yarn test:unit`       | Run the Vitest unit suites without the Playwright snapshot harness |
| `yarn test:snapshots`  | Build Storybook and run the Playwright snapshot suite              |

## Published MDX Docs

The `src/components/*/*.docs.mdx` pages render in Storybook and are also
published for external sites (see README "Published Component Docs"). The
published pages must work compiled as React Server Components (fumadocs on
Next.js), where hooks, inline functions, and property access through client
references are all illegal — the pipeline restructures the pages accordingly
and fails the build on violations:

- `build:docs-demos` (pre-tsup) extracts every module-level export except
  `meta` from each page into a generated client module
  (`docs/demos/<slug>.gen.tsx` → `@hashintel/ds-components/docs/demos/<slug>`),
  and generates `compound-parts.gen.tsx`, which flattens compound members the
  page bodies use (`Banner.Title` → `BannerTitle`). The generated files are
  excluded from tsc (inline MDX components were never type-checked) and are
  validated by the esbuild compile plus render verification.
- `tsup` builds those plus the doc blocks as entry points
  (`dist/docs/blocks/<name>.js`), all sharing chunks with the component
  entries so every surface uses one module instance per component, and banners
  every output with `"use client"`.
- `build:docs-mdx` emits the portable MDX to `dist/docs/mdx/<slug>.mdx`: meta
  duplicated as YAML frontmatter, Storybook `Meta` stripped, leading
  title/description dropped, moved exports removed and imported back from the
  demos module, react imports pruned to server-safe names, relative imports
  rewritten to package specifiers, each `<Stage>`'s Code tab baked in as a
  literal `code` attribute via `.storybook/remark-stage-code.ts` (so the
  displayed code keeps the authored `Banner.Title`-style API and `noop`
  renders as `() => {}`), and compound members in live JSX flattened. Each
  page is then gated (no hooks/functions/compound members in the published
  module), compile-checked with @mdx-js/mdx, and server-rendered against the
  published entries — which is also where the `meta` for the frontmatter is
  read from. The `meta` export stays in the files because page bodies
  reference it (`meta.links.source`). The script also writes hand-maintained
  `.d.ts` stubs for the doc blocks and errors on any block lacking one.
- Inline handlers in docs examples are authored as `onX={noop}`
  (`src/util/noop.ts`, published flat as `@hashintel/ds-components/noop`) —
  client-module exports cross the RSC boundary as references where inline
  arrows cannot. Interactive stateful examples are authored as inline
  exported components (the extraction moves them); `DemoState` makes
  controlled examples live.
- `codegen:docgen` generates `docs/blocks/props-table/docgen-registry.gen.ts`,
  the identity-keyed prop-docs registry `PropsTable` falls back to where
  Storybook's `__docgenInfo` injection is absent. Parser options are shared
  with `.storybook/main.ts` via `docs/docgen-options.ts`.
- `build:buildinfo:docs` ships the doc blocks' style usage to
  `dist/docs/panda.buildinfo.json` (`panda.docs.config.ts`), separate from the
  main buildinfo so app consumers don't carry docs-only CSS.

## File Structure

```
libs/@hashintel/ds-components/
├── .storybook/             # Storybook/demo harness
├── src/
│   ├── components/
│   ├── preset/             # Panda preset source of truth
│   ├── tokens/             # Token stories and fixtures
│   ├── tokens.ts           # Public `./tokens` facade
├── scripts/                # Token/codegen scripts
├── tests/                  # Snapshot/demo tests
├── panda.config.ts
├── panda.local.config.ts
├── package.json
└── tsconfig.json
```

## Regenerating Tokens

When tokens or preset inputs change:

```bash
# 1. Regenerate token source files inside ds-components
cd libs/@hashintel/ds-components
yarn codegen:colors
yarn codegen:tokens

# 2. Regenerate the styled-system artifact in ds-helpers
yarn codegen

# 3. Verify the package surface still compiles
yarn lint:tsc
```

## Related Packages

- **ds-helpers**: generated Panda styled-system artifact (`libs/@hashintel/ds-helpers`)
