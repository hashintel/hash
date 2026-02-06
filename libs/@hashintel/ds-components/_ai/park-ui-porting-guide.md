# Park UI Porting Guide

This document captures findings from analyzing park-ui's architecture to establish a repeatable process for porting components to `@hashintel/ds-components`.

## Reference Repositories

| Repository | Local Path | Description |
|------------|------------|-------------|
| chakra-ui/ark | `~/Clones/chakra-ui/ark` | Headless component primitives |
| chakra-ui/panda | `~/Clones/chakra-ui/panda` | CSS-in-JS framework |
| chakra-ui/park-ui | `~/Clones/chakra-ui/park-ui` | Styled components (our reference) |

## Park UI Architecture

### Package Structure

```
park-ui/
├── packages/preset/           # Panda CSS preset with recipes + tokens
│   └── src/
│       ├── recipes/           # Slot recipes (defineSlotRecipe)
│       └── theme/
│           ├── colors/        # Per-palette semantic tokens
│           └── tokens/        # Base tokens
└── components/react/          # React component wrappers
    └── src/components/ui/     # Components using createStyleContext
```

### Slot Recipes Pattern

Recipes use `defineSlotRecipe` with anatomy from Ark UI:

```ts
import { checkboxAnatomy } from '@ark-ui/react/anatomy'
import { defineSlotRecipe } from '@pandacss/dev'

export const checkbox = defineSlotRecipe({
  slots: checkboxAnatomy.keys(),
  className: 'checkbox',
  base: {
    root: { /* styles */ },
    control: { /* styles */ },
    label: { /* styles */ },
  },
  variants: {
    size: { sm: {}, md: {}, lg: {} },
    variant: { solid: {}, subtle: {}, outline: {} },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
})
```

### Component Pattern

Components wrap Ark UI primitives with style context:

```tsx
import { Checkbox } from '@ark-ui/react/checkbox'
import { createStyleContext } from 'styled-system/jsx'
import { checkbox } from 'styled-system/recipes'

const { withProvider, withContext } = createStyleContext(checkbox)

export const Root = withProvider(Checkbox.Root, 'root')
export const Control = withContext(Checkbox.Control, 'control')
export const Label = withContext(Checkbox.Label, 'label')
```

### Testing Pattern

Park UI uses **Storybook examples only** — no unit tests. Stories are organized as:
- `/examples/{component}/{component}.stories.tsx` — story entry
- `/examples/{component}/basic.tsx`, `variants.tsx`, etc. — individual examples

---

## Color Token Architecture

### Radix Color Scale (1-12)

Park UI uses Radix colors with semantic meaning per step:

| Steps | Purpose |
|-------|---------|
| 1-2 | Backgrounds (app, subtle) |
| 3-5 | Interactive UI (default, hover, active) |
| 6-8 | Borders (subtle, default, emphasis) |
| 9-10 | Solid backgrounds (default, hover) |
| 11-12 | Text (low-contrast, high-contrast) |

Plus alpha variants `a1-a12` for translucent overlays.

### HASH Gray Scale Mapping

Established mapping from Radix neutral → HASH gray:

| Radix | HASH | Purpose |
|-------|------|---------|
| 1 | 10 | Lightest background |
| 2 | 10 | Subtle background |
| 3 | 20 | UI element background |
| 4 | 20 | Hovered UI element |
| 5 | 30 | Active/selected UI |
| 6 | 30 | Subtle borders |
| 7 | 40 | Border / focus ring |
| 8 | 40 | Solid border |
| 9 | 50 | Solid backgrounds |
| 10 | 50 | Hovered solid |
| 11 | 60 | Low-contrast text |
| 12 | 90 | High-contrast text |

Visual comparison story: `libs/@hashintel/ds-helpers/stories/colors.radix-mapping.story.tsx`

### Alpha → Solid Mapping

Since HASH doesn't have alpha variants, alpha references map to solid equivalents:

| Radix Alpha | HASH Solid |
|-------------|------------|
| a1-a2 | 00 |
| a3-a4 | 10 |
| a5-a6 | 20 |
| a7 | 30 |
| a8 | 40 |
| a9-a10 | 50 |
| a11 | 60 |
| a12 | 90 |

**Limitation**: Loses translucency effects for hover states and layered surfaces.

---

## Semantic Token Variants

Park UI defines 5 semantic variants per color palette:

### 1. `solid`
Bold, primary actions (buttons, badges)
```
bg.DEFAULT → 9
bg.hover → 10
fg → white
```

### 2. `subtle`
Soft backgrounds, secondary emphasis
```
bg.DEFAULT → a3
bg.hover → a4
bg.active → a5
fg → a11
```

### 3. `surface`
Cards, panels with visible borders
```
bg.DEFAULT → a2
bg.active → a3
border.DEFAULT → a6
border.hover → a7
fg → a11
```

### 4. `outline`
Ghost-style with border only
```
bg.hover → a2
bg.active → a3
border.DEFAULT → a7
fg → a11
```

### 5. `plain`
Text-only, no background or border
```
bg.hover → a3
bg.active → a4
fg → a11
```

### Global Aliases

```
fg.default → gray.12
fg.muted → gray.11
fg.subtle → gray.10
canvas → gray.1
border → gray.4
error → red.9
```

---

## Token Reference Patterns in Recipes

### 1. `colorPalette.*` (dynamic)
```ts
bg: 'colorPalette.solid.bg'
color: 'colorPalette.subtle.fg'
borderColor: 'colorPalette.surface.border.hover'
```
Resolves based on `colorPalette` prop (e.g., `colorPalette="blue"`).

### 2. `gray.*` semantic
```ts
bg: 'gray.surface.bg'
borderColor: 'gray.outline.border'
```
References gray palette's semantic variants directly.

### 3. `gray.{1-12}` direct (rare)
```ts
bg: { _light: 'gray.2', _dark: 'gray.1' }
```
Direct scale reference for edge cases.

### 4. Global aliases
```ts
color: 'fg.default'
bg: 'border'
bg: 'error'
```

---

## Porting Strategy Options

### Option A: Adapt Tokens

Add park-ui's variant structure to `@hashintel/ds-theme`:

```ts
// In ds-theme semantic tokens
gray: {
  solid: {
    bg: { DEFAULT: '{colors.gray.50}', hover: '{colors.gray.60}' },
    fg: { DEFAULT: '{colors.neutral.white}' },
  },
  subtle: {
    bg: { DEFAULT: '{colors.gray.10}', hover: '{colors.gray.20}', active: '{colors.gray.30}' },
    fg: { DEFAULT: '{colors.gray.60}' },
  },
  // ... surface, outline, plain
}
```

**Pros**: Recipes work with minimal changes
**Cons**: Token structure becomes more complex; may diverge from Figma source

### Option B: Adapt Recipes

Keep current HASH token structure, refactor each recipe:

```ts
// Before (park-ui)
bg: 'colorPalette.solid.bg'

// After (HASH)
bg: 'bg.accent.bold.default'
```

**Pros**: Token structure stays aligned with Figma
**Cons**: More work per recipe; need mapping table

### Hybrid Approach

1. Define the 5 variant structures in ds-theme for `gray`/`neutral` only
2. Map `colorPalette` to use HASH accent tokens
3. Keep direct scale references using the established LUT

---

## Files Created

| File | Purpose |
|------|---------|
| `libs/@hashintel/ds-helpers/stories/colors.radix-mapping.story.tsx` | Visual comparison tool for scale mapping |
| `libs/@hashintel/ds-components/_ai/park-ui-porting-guide.md` | This document |

## Next Steps

1. Decide on porting strategy (adapt tokens vs adapt recipes)
2. If adapting tokens: extend ds-theme with variant structures
3. If adapting recipes: create transform utility with LUT
4. Port first component (suggest: Checkbox or Button) as proof of concept
5. Document the porting workflow based on learnings
