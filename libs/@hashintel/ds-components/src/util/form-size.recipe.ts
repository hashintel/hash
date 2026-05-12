/**
 * Shared per-size style values for sized form-input components
 * (Button, TextInput, …). Internal — these CSS variables are NOT part of
 * the public token API and are not re-exported through
 * `@hashintel/ds-components/tokens`.
 *
 * Recipes spread `formSizeRecipeConfig.variants.size.<size>` into their own
 * size variants — same pattern as `inputRecipeConfig` is consumed by
 * `combobox.recipe.ts`. Panda extracts the literal values via the
 * `cva(formSizeRecipeConfig)` call below, so the atomic CSS classes for
 * each property are emitted to the stylesheet and reused by every recipe
 * that spreads from this config.
 *
 *   size | textStyle | --form-padding-y | --form-line-height
 *   -----+-----------+------------------+-------------------
 *   xxs  | xxs       | 1px              | 1.6em
 *   xs   | xs        | spacing.0        | 1.6em
 *   sm   | sm        | spacing.0.5      | 1.6em
 *   md   | base      | spacing.1        | 1.5em
 *   lg   | base      | spacing.2        | 1.5em
 *
 * `--form-border-width` is `1px` for every size. The line-height matches
 * the corresponding `textStyle` definition; call sites multiply it by
 * `var(--leading-factor)` so the global leading utility still applies.
 */
export const formSizes = {
  xxs: {
    textStyle: "xxs",
    "--form-border-width": "1px",
    "--form-padding-y": "1px",
    "--form-line-height": "1.6em",
  },
  xs: {
    textStyle: "xs",
    "--form-border-width": "1px",
    "--form-padding-y": "spacing.0",
    "--form-line-height": "1.6em",
  },
  sm: {
    textStyle: "sm",
    "--form-border-width": "1px",
    "--form-padding-y": "spacing.0.5",
    "--form-line-height": "1.6em",
  },
  md: {
    textStyle: "base",
    "--form-border-width": "1px",
    "--form-padding-y": "spacing.1",
    "--form-line-height": "1.5em",
  },
  lg: {
    textStyle: "base",
    "--form-border-width": "1px",
    "--form-padding-y": "spacing.2",
    "--form-line-height": "1.5em",
  },
} as const;
