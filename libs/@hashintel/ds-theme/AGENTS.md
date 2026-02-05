# @hashintel/ds-theme - Agent Context

## Architecture

This package is the **foundation** of the HASH design system, providing design tokens that flow through the system:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ds-theme      │────▶│   ds-helpers    │────▶│  ds-components  │
│  (Panda Preset) │     │ (Styled System) │     │ (React + Ark UI)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
     ▲ YOU ARE HERE           │                       │
   Design tokens          css(), cva(),           Button, Checkbox,
   from token generators  tokens, jsx             Avatar, etc.
```

## Purpose

A **Panda CSS preset** that exports design tokens. Consumed by `@hashintel/ds-helpers` which generates the styled-system utilities.

## Token Generation

Primary color tokens are generated from Radix colors. The legacy Figma pipeline
remains for reference and will be removed after the next token refresh.

```
scripts/generate-colors-radix.ts  →  src/theme/colors/*.gen.ts
scripts/figma-variables.json      →  generate-colors.ts  →  src/theme/colors/*.gen.ts (deprecated)
                                  →  generate-tokens.ts  →  src/theme/tokens/*.gen.ts
```

Note: Generated files use `.gen.ts` suffix and are gitignored (per repo convention).

### Generation Workflow

1. Run `yarn codegen` to regenerate token files
2. Downstream packages regenerate their styled-system via `panda codegen`
3. Export variables from Figma only when refreshing legacy token sources

### Codegen Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `yarn codegen`              | Run all generators + format output            |
| `yarn codegen:colors`       | Generate color tokens from Figma (deprecated) |
| `yarn codegen:colors:radix` | Generate color tokens from Radix              |
| `yarn codegen:tokens`       | Generate spacing/typography/radii from Figma  |
| `yarn codegen:format`       | Format generated files with Biome             |

## Exports

| Entry Point                 | Description                                |
| --------------------------- | ------------------------------------------ |
| `@hashintel/ds-theme`       | Panda CSS preset (use in `presets: [...]`) |
| `@hashintel/ds-theme/theme` | Direct theme object access                 |

### Usage in Consumer Packages

```ts
// panda.config.ts in ds-helpers or ds-components
import { defineConfig } from '@pandacss/dev';

export default defineConfig({
  presets: ['@hashintel/ds-theme'],
  // ...
});
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
├── scripts/
│   ├── figma-variables.json   # Source: exported from Figma
│   ├── generate-colors.ts     # Color token generator
│   ├── generate-tokens.ts     # Spacing/typography/radii generator
│   └── transforms.ts          # Shared transform utilities
├── src/
│   ├── main.ts                # Panda CSS preset definition
│   ├── theme.ts               # Theme object export
│   └── theme/
│       ├── colors/            # Generated color token files (*.gen.ts, gitignored)
│       ├── colors.gen.ts      # Colors barrel export (generated, gitignored)
│       ├── tokens/            # Generated + manual token files (*.gen.ts gitignored)
│       ├── tokens.gen.ts      # Tokens barrel export (generated, gitignored)
│       └── recipes/           # Panda CSS recipes (if any)
├── dist/                      # Built output
├── package.json
└── tsconfig.json
```

## Scripts

| Script          | Description                      |
| --------------- | -------------------------------- |
| `yarn build`    | Build with tsdown                |
| `yarn dev`      | Build in watch mode              |
| `yarn codegen`  | Regenerate all tokens |
| `yarn lint:tsc` | TypeScript type checking         |
| `yarn test`     | Run tests                        |

## Related Packages

- **ds-helpers**: Consumes this preset, generates styled-system (`libs/@hashintel/ds-helpers`)
- **ds-components**: Imports utilities from ds-helpers (`libs/@hashintel/ds-components`)
