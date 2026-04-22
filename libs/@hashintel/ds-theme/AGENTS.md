# @hashintel/ds-theme - Agent Context

## Purpose

`@hashintel/ds-theme` is now a compatibility shim.

It exists so callers can keep importing:

- `@hashintel/ds-theme`
- `@hashintel/ds-theme/theme`

but the source of truth now lives in `@hashintel/ds-components`.

## Architecture

```
ds-components src/preset + src/theme
        │
        ▼
    ds-theme shim
  re-exports only
```

Boundary rules:

- do not add token generation scripts or source-of-truth theme files back here
- do not point Panda consumers here for new internal work; use `@hashintel/ds-components/preset`
- if a change affects design tokens or preset behavior, make it in `ds-components`

## Exports

| Entry Point                 | Description                                |
| --------------------------- | ------------------------------------------ |
| `@hashintel/ds-theme`       | Re-export of `@hashintel/ds-components/preset` |
| `@hashintel/ds-theme/theme` | Re-export of `@hashintel/ds-components/theme` |

### Usage in Consumer Packages

```ts
// Internal repo consumers should prefer this instead:
import { scopedThemeConfig } from '@hashintel/ds-components/preset';
```

## Token Structure

### Core Colors

Direct color scales with numeric shades (generated from Radix colors):

```
gray.{00,10,20,30,35,40,50,60,70,80,90,95}
red, blue, green, orange, yellow, pink, purple, accent
neutral.{white,black}
```

### Semantic Colors

Purpose-driven tokens that reference core colors:

- `bg.*` - Background colors (accent, neutral, status variants)
- `text.*` - Text colors (primary, secondary, link, status)
- `border.*` - Border colors (neutral, status variants)
- `surface.*` - Surface colors (default, subtle, emphasis)
- `icon.*` - Icon colors

### Other Tokens

- `spacing` - Layout spacing (default, compact, comfortable scales)
- `radii` - Border radius values
- `typography` - Font sizes, line heights, font weights
- `shadows` - Box shadow definitions
- `durations` - Animation durations
- `z-index` - Z-index scale

## File Structure

```
libs/@hashintel/ds-theme/
├── src/
│   ├── main.ts     # re-exports ds-components preset helpers
│   └── theme.ts    # re-exports ds-components theme facade
├── dist/
├── package.json
└── tsconfig.json
```

## Scripts

| Script          | Description                      |
| --------------- | -------------------------------- |
| `yarn build`    | Build the shim entrypoints |
| `yarn dev`      | Build in watch mode |
| `yarn lint:tsc` | TypeScript type checking |

## Related Packages

- **ds-components**: source-of-truth preset/theme owner (`libs/@hashintel/ds-components`)
- **ds-helpers**: generated styled-system artifact (`libs/@hashintel/ds-helpers`)
