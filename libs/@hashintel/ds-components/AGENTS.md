# @hashintel/ds-components - Agent Context

## Purpose

`@hashintel/ds-components` is now the source-owning design-system package.

It owns:

- the Panda preset source in `src/preset/**`
- token/codegen scripts in `scripts/**`
- the component library in `src/components/**`
- the token/demo surface in `src/stories/**`, `.ladle/`, and `tests/**`

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
- `@hashintel/ds-components/preset` and `@hashintel/ds-components/theme` are the canonical public preset/theme entrypoints.

## Panda CSS Configuration

### panda.config.ts

```ts
import { defineConfig } from "@pandacss/dev";

import { preset } from "./src/preset";

export default defineConfig({
  importMap: "@hashintel/ds-helpers",
  outdir: "../ds-helpers/styled-system",
  include: [
    "./src/components/**/*.{ts,tsx}",
  ],
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
- `panda.local.config.ts` exists separately for local demo surfaces such as Ladle

### Token Naming Patterns (Strict Mode)

With `strictTokens: true`, you must use the exact token names:

| Token Type       | ❌ Invalid             | ✅ Valid                                          |
| ---------------- | --------------------- | ------------------------------------------------ |
| Spacing          | `spacing.4`, `"4"`    | `default.4`, `compact.4`, `comfortable.4`        |
| Radii            | `radius.2`, `md`      | `md.2`, `sm.3`, `lg.full`, `component.button.sm` |
| FontSize         | `size.textsm`         | `sm`, `xs`, `base`, `lg`, `xl`, `2xl`            |
| LineHeight       | `leading.none.textsm` | `none.text-sm`, `normal.text-base`               |
| Arbitrary values | `64px`                | `[64px]`                                         |

Token types for stories and public token access should come from `@hashintel/ds-helpers/tokens`.

### Import Patterns

Component implementation continues to use the generated styling runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from '@hashintel/ds-helpers/css';
import { Box, Flex, Stack } from '@hashintel/ds-helpers/jsx';
```

When you need token lookup helpers or token types, use:

```ts
import { token, type Token } from '@hashintel/ds-helpers/tokens';
```

## Color Token Naming

### Core Colors

Direct color scales with numeric shades:

```
gray.{00,10,20,30,35,40,50,60,70,80,90,95}
red.{00,10,20,...,90}
blue.{00,10,20,...,90}
accent.{00,10,20,...,90}
neutral.{white,black}
```

### Semantic Colors

Semantic tokens reference core colors:

**Backgrounds (`bg.*`):**
```
bg.accent.subtle.{default,hover,active}
bg.accent.bold.{default,hover,pressed,active}
bg.neutral.subtle.{default,hover,active,pressed}
bg.neutral.bold.{default,hover,active,pressed}
bg.status.{info,success,caution,warning}.subtle.{default,hover,active}
bg.status.critical.subtle.{default,hover,active}
bg.status.critical.strong.{default,hover,active}
```

**Text (`text.*`):**
```
text.{primary,secondary,tertiary,disabled,inverted}
text.{link,linkHover}
text.status.{info,success,warning,critical}
```

**Borders (`border.*`):**
```
border.neutral.{muted,subtle,default,emphasis,hover,active}
border.status.{info,success,caution,warning,critical}
```

**Surfaces (`surface.*`):**
```
surface.{default,subtle,muted,emphasis,alt,inverted}
```

### Token Mapping from Legacy Names

When updating components, use this mapping:

| Old (incorrect)          | New (correct)          |
| ------------------------ | ---------------------- |
| `bg.brand.*`             | `bg.accent.*`          |
| `core.gray.20`           | `gray.20`              |
| `core.red.50`            | `red.50`               |
| `core.custom.30`         | `accent.30`            |
| `text.linkhover`         | `text.linkHover`       |
| `text.semantic.critical` | `text.status.critical` |

## Component Patterns

### Recipe Definition

Components use `cva()` for variant-based styling:

```tsx
import { cva } from '@hashintel/ds-helpers/css';

const buttonRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    // ...base styles
  },
  variants: {
    variant: {
      primary: {},
      secondary: {},
      ghost: {},
    },
    size: {
      sm: { height: "[28px]", px: "spacing.5" },
      md: { height: "[32px]", px: "spacing.6" },
      lg: { height: "[40px]", px: "spacing.8" },
    },
  },
  compoundVariants: [
    {
      variant: "primary",
      colorScheme: "brand",
      css: {
        backgroundColor: "bg.accent.bold.default",
        color: "text.inverted",
        _hover: { backgroundColor: "bg.accent.bold.hover" },
      },
    },
  ],
});
```

### Ark UI Integration

Components wrap Ark UI primitives with Panda styling:

```tsx
import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox';
import { css } from '@hashintel/ds-helpers/css';

export const Checkbox = (props) => (
  <ArkCheckbox.Root className={css({ /* styles */ })} {...props}>
    <ArkCheckbox.Control className={css({ /* styles */ })}>
      <ArkCheckbox.Indicator>
        {/* check icon */}
      </ArkCheckbox.Indicator>
    </ArkCheckbox.Control>
    <ArkCheckbox.Label>{props.children}</ArkCheckbox.Label>
  </ArkCheckbox.Root>
);
```

## Scripts

| Script | Description |
| --- | --- |
| `yarn dev` | Start the primary Ladle-based demo loop |
| `yarn dev:lib` | Watch the publishable component library build |
| `yarn codegen` | Generate token source files and `../ds-helpers/styled-system` |
| `yarn build` | Build the component library entrypoints |
| `yarn build:ladle` | Build the Ladle demo surface |
| `yarn lint:eslint` | Lint the publishable package surface |
| `yarn lint:tsc` | TypeScript type checking |
| `yarn test:unit` | Run the Vitest unit suites without the Playwright snapshot harness |
| `yarn test:snapshots` | Build Ladle and run the Playwright snapshot suite |

## File Structure

```
libs/@hashintel/ds-components/
├── .ladle/                 # Ladle/demo harness
├── src/
│   ├── components/
│   ├── preset/             # Panda preset source of truth
│   ├── stories/
│   ├── theme.ts            # Public `./theme` facade
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
