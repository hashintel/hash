# @hashintel/ds-components - Agent Context

## Purpose

React component library built with **Panda CSS** and **Ark UI**. Components consume styling utilities from `@hashintel/ds-helpers` and export accessible, styled UI primitives.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ds-theme      │────▶│   ds-helpers    │────▶│  ds-components  │
│  (Panda Preset) │     │ (Styled System) │     │ (React + Ark UI)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                    ▲ YOU ARE HERE
   Design tokens          css(), cva(),           Button, Checkbox,
   from Figma             tokens, jsx             Avatar, etc.
```

- **ds-theme**: Panda CSS preset containing design tokens (colors, spacing, etc.)
- **ds-helpers**: Generates and exports styled-system utilities (`css()`, `cva()`, `token()`, JSX components)
- **ds-components**: Imports from ds-helpers, wraps Ark UI primitives with styled components

### Reference Implementation

This package aims to follow patterns from **Park UI** (https://park-ui.com), the official Ark UI + Panda CSS integration:

- Park UI preset: `/Users/lunelson/Code/chakra-ui/park-ui/packages/preset`
- Park UI React components: `/Users/lunelson/Code/chakra-ui/park-ui/components/react`

## Panda CSS Configuration

### panda.config.ts

```ts
import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  strictTokens: true,  // Enforces valid token references at compile time
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  theme: { extend: {} },
  presets: ["@hashintel/ds-theme"],
  jsxFramework: "react",
});
```

Key points:
- `strictTokens: true` - TypeScript will error on invalid token names
- Preset from `@hashintel/ds-theme` provides all tokens
- `jsxFramework: "react"` enables JSX components

### Token Naming Patterns (Strict Mode)

With `strictTokens: true`, you must use the exact token names:

| Token Type | ❌ Invalid | ✅ Valid |
|------------|-----------|----------|
| Spacing | `spacing.4`, `"4"` | `default.4`, `compact.4`, `comfortable.4` |
| Radii | `radius.2`, `md` | `md.2`, `sm.3`, `lg.full`, `component.button.sm` |
| FontSize | `size.textsm` | `sm`, `xs`, `base`, `lg`, `xl`, `2xl` |
| LineHeight | `leading.none.textsm` | `none.text-sm`, `normal.text-base` |
| Arbitrary values | `64px` | `[64px]` |

The token types are defined in `@hashintel/ds-helpers/types`.

### Import Patterns

Components import styling utilities from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from '@hashintel/ds-helpers/css';
import { token } from '@hashintel/ds-helpers/tokens';
import { Box, Flex, Stack } from '@hashintel/ds-helpers/jsx';
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

| Old (incorrect)          | New (correct)              |
|--------------------------|----------------------------|
| `bg.brand.*`             | `bg.accent.*`              |
| `core.gray.20`           | `gray.20`                  |
| `core.red.50`            | `red.50`                   |
| `core.custom.30`         | `accent.30`                |
| `text.linkhover`         | `text.linkHover`           |
| `text.semantic.critical` | `text.status.critical`     |

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
|--------|-------------|
| `yarn storybook` | Start Storybook dev server |
| `yarn storybook:build` | Build static Storybook |
| `yarn build` | Build component library with Vite |
| `yarn lint:tsc` | TypeScript type checking |
| `yarn panda codegen --clean` | Regenerate styled-system from preset |

## File Structure

```
libs/@hashintel/ds-components/
├── src/
│   ├── components/
│   │   ├── Avatar/
│   │   ├── Badge/
│   │   ├── Button/
│   │   ├── Checkbox/
│   │   └── ...
│   ├── playground/
│   └── stories/
├── .storybook/             # Storybook configuration
├── panda.config.ts
├── package.json
└── tsconfig.json
```

## Regenerating Tokens

When tokens change in `@hashintel/ds-theme`:

```bash
# 1. In ds-theme: regenerate token files
cd libs/@hashintel/ds-theme
yarn codegen

# 2. In ds-helpers: regenerate styled-system
cd libs/@hashintel/ds-helpers
yarn codegen

# 3. In ds-components: verify types still compile
cd libs/@hashintel/ds-components
yarn lint:tsc
```

## Related Packages

- **ds-theme**: Design tokens from Figma (`libs/@hashintel/ds-theme`)
- **ds-helpers**: Styled-system utilities (`libs/@hashintel/ds-helpers`)
