import { cva } from "@hashintel/ds-helpers/css";

/**
 * Shared per-width style values for sized form-input components
 * (TextInput, …). Internal — these CSS variables are NOT part of the
 * public token API and are not re-exported through
 * `@hashintel/ds-components/tokens`.
 *
 * Recipes spread `formWidthBase` into the root unconditionally (to
 * define `--form-min-width`) and `formWidths.<width>` into the width
 * variants (to define `--form-width`). Inner slots reference
 * `var(--form-width)` and `var(--form-min-width)` wherever the input
 * is sized — same pattern as `formSizes` is consumed by
 * `base-input.recipe.ts`.
 *
 *   width | --form-width
 *   ------+-------------
 *   xs    | 6rem
 *   sm    | 15rem
 *   md    | 22.5rem
 *   lg    | 35rem
 */
export const formWidths = {
  base: {
    "--form-min-width": "6rem",
  },
  variants: {
    widths: {
      xs: { "--form-width": "6rem" },
      sm: { "--form-width": "15rem" },
      md: { "--form-width": "22.5rem" },
      lg: { "--form-width": "35rem" },
    },
  },
} as const;

// Do not use this export! We only need to export this as a recipe for panda to be able to properly analyze and share styles
export const formWidthsRecipe = cva(formWidths);
