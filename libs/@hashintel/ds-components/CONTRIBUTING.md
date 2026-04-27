# Contributing to @hashintel/ds-components

This guide covers the current post-FE-612 package layout for humans and coding assistants working in the HASH design system.

## Ownership Model

- `@hashintel/ds-components` is the source-owning package.
- `src/preset/**` contains the Panda preset source and theme/token inputs used by the preset.
- `scripts/**` owns token and color code generation.
- `src/components/**`, `src/stories/**`, `.ladle/**`, and `tests/**` are owned here as the component, demo, and snapshot surfaces.
- `@hashintel/ds-helpers` is the generated Panda `styled-system` artifact only.
- The old `@hashintel/ds-theme` package has been retired; use `@hashintel/ds-components/preset` and `@hashintel/ds-components/theme` instead.

For new internal work, treat `ds-components` as the only source of truth.

## Where To Change Things

| Area | Location | Notes |
| --- | --- | --- |
| Components | `src/components/<Component>/<component>.tsx` and `src/components/*/*.stories.tsx` | Public component entrypoints live at the top of `src/components/` and are built by `tsdown`. |
| Panda preset source | `src/preset.ts`, `src/preset/**` | This is the live preset consumed by `@hashintel/ds-components/preset`. |
| Package-owned theme facade | `src/theme.ts` | Re-exports from `src/preset/theme`. |
| Token and color generators | `scripts/**` | Reads `scripts/figma-variables.json` and writes generated preset files under `src/preset/theme/**`. |
| Token demo stories | `src/stories/tokens/**` | Token reference and migration/demo stories live here now. |
| Local demo config | `panda.local.config.ts` | Shared Panda config for local demo surfaces such as Ladle. |
| Ladle harness | `.ladle/**` | Used for the token/demo surface and Playwright snapshots. |
| Snapshot tests | `tests/**` | Snapshot harness for the Ladle surface. |

## Import Rules

Component implementation should keep using the generated Panda runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Box, Flex, Stack } from "@hashintel/ds-helpers/jsx";
```

When you need token lookup helpers or public token types, use the generated runtime directly:

```ts
import { token, type Token } from "@hashintel/ds-helpers/tokens";
```

When a consumer needs the Panda preset, use:

```ts
import { preset, scopedThemeConfig } from "@hashintel/ds-components/preset";
```

Do not resurrect `@hashintel/ds-theme`; `ds-components` now owns the public preset and theme entrypoints directly.

## Component Workflow

### 1. Gather Design Context

- Use Figma MCP to inspect the selected component and its variables.
- Use Ark UI docs or MCP examples to confirm the primitive structure before writing wrappers.
- Check an existing component in `src/components/` for the closest styling and prop pattern.

### 2. Implement In The Current Layout

For a new component, keep the package pattern aligned with the existing files:

```text
src/components/MyComponent/my-component.tsx
src/components/MyComponent/my-component.stories.tsx
```

The top-level `src/components/<Component>/<component>.tsx` files are the publishable entrypoints collected by `tsdown.config.ts`. The nested `PascalCase` directories hold stories and Figma mappings.

Do not add `index.ts` files for component directories.

### 3. Style With Panda Runtime Utilities

- Use `cva()` for reusable variant-driven recipes.
- Use `css()` for small one-off style objects.
- Use Ark UI data attributes for interaction states instead of inventing extra local state.
- Use bracket notation for literal values not represented in the token system, for example `[316px]`.

Example:

```tsx
import { Checkbox as ArkCheckbox } from "@ark-ui/react/checkbox";
import { css } from "@hashintel/ds-helpers/css";

export const Example = () => (
  <ArkCheckbox.Root
    className={css({
      display: "inline-flex",
      alignItems: "center",
      gap: "default.3",
      color: "text.primary",
      "&[data-disabled]": {
        opacity: "[0.5]",
        cursor: "not-allowed",
      },
    })}
  />
);
```

### 4. Add Stories

- Add or update Ladle stories beside the component-specific story folder or for tokens.

### 5. Verify The Surface

Run the smallest relevant checks first, then broaden as needed:

```bash
yarn lint:eslint
yarn lint:tsc
yarn dev:ladle
```

When the change affects tokens, preset behavior, Ladle stories, or the snapshot harness, also run:

```bash
yarn codegen
yarn build:ladle
yarn test:unit
yarn test:snapshots
```

## Token And Preset Workflow

### Source Of Truth

- Preset source lives in `src/preset.ts` and `src/preset/**`.
- Codegen inputs live in `scripts/figma-variables.json` and the generator scripts in `scripts/**`.
- Generated preset outputs are committed under `src/preset/theme/**`.
- The publish/runtime styled-system is generated into `../ds-helpers/styled-system`.

### Regeneration Commands

Run these from `libs/@hashintel/ds-components` when token or preset inputs change:

```bash
yarn codegen:colors
yarn codegen:tokens
yarn codegen
```

The `prepare` lifecycle runs the same `codegen` script. It generates Panda's
authoring modules and types, not a standalone CSS file. Ladle use
Panda's Vite/PostCSS integration through `postcss.config.cjs` for CSS
extraction.

### Token Naming In Strict Mode

The package runs Panda with strict token validation. Use the live token names, not the pre-restructure aliases.

| Token Type | Avoid | Use Instead |
| --- | --- | --- |
| Spacing | `spacing.4`, `"4"` | `default.4`, `compact.4`, `comfortable.4` |
| Radii | `radius.2`, `md` | `md.2`, `sm.3`, `lg.full`, `component.button.sm` |
| Font sizes | `size.textsm` | `xs`, `sm`, `base`, `lg`, `xl`, `2xl` |
| Line heights | `leading.none.textsm` | `none.text-sm`, `normal.text-base` |
| Literal values | `64px` | `[64px]` |

Color tokens should come from the semantic palette already defined in the preset, for example `bg.accent.bold.default`, `border.neutral.default`, and `text.primary`.

### Finding The Right Token

- Start with the Figma variable or screenshot.
- Check the preset sources under `src/preset/theme/**`.
- Use `@hashintel/ds-helpers/tokens` in stories or small probes when you need to inspect the resolved token values.
- Search existing components and token stories before creating a new naming pattern.

## Ladle, And Snapshots

- `yarn dev` is the primary Ladle-based loop and the best default when changing token stories or the demo harness. It uses the shared Vite/PostCSS config for Panda style extraction while Ladle is running.
- `yarn dev:lib` is the lightest loop when you only need the publishable package build watcher.
- `src/stories/tokens/**` owns the token reference stories that used to live under `ds-helpers`.
- `tests/snapshots.spec.ts` exercises the Ladle surface and stores the images in `tests/__snapshots__/`.

## Common Pitfalls

### Stale package targets

- Do not move preset code, token generators, or stories back into a recreated theme package or into `ds-helpers`.
- Do not add a dependency edge from `ds-helpers` back to `ds-components`.

### Token lookup confusion

- If a token name seems missing, check whether you are using an old alias like `spacing.4` or `size.textsm`.
- Verify the name against the preset source or the exported `Token` type from `@hashintel/ds-helpers/tokens`.

### Component export confusion

- New publishable components should be added as top-level files in `src/components/<Component>/<component>.tsx`.
- Story and Figma helper files stay in the nested component directory and are not part of the package entrypoint surface.

## References

- [README](./README.md)
- [Ark UI documentation](https://ark-ui.com)
- [Ark UI MCP server documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP server documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [PandaCSS documentation](https://panda-css.com)
