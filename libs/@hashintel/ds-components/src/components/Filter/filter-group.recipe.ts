import { css, cva } from "@hashintel/ds-helpers/css";

import { filterFontSizes } from "./filter.recipe";

export const actionClassName = "filter-group-action";

// Text label for the action buttons, matching the Filter chip's per-size
// font sizes. Declared on an inner span so the button's own font-size (which
// its line-height and height resolve against) is untouched; lineHeight 1
// keeps the span's inline box nested inside the button's strut so the line
// box cannot grow.
export const actionLabel = cva({
  base: {
    fontSize: "[var(--filter-font-size)]",
    lineHeight: "[1]",
  },
  variants: {
    size: {
      xxs: { ...filterFontSizes.variants.sizes.xxs },
      xs: { ...filterFontSizes.variants.sizes.xs },
      sm: { ...filterFontSizes.variants.sizes.sm },
      md: { ...filterFontSizes.variants.sizes.md },
      lg: { ...filterFontSizes.variants.sizes.lg },
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

// 0.75× the Button's per-size horizontal padding. Scoped under the marker
// class so the two-class selector reliably out-specifies the button's own
// paddingX atom (same property and layer, so specificity must decide).
export const clearFiltersButton = cva({
  variants: {
    size: {
      xxs: {
        "&.filter-group-action": {
          paddingX: "1.5",
        },
      },
      xs: {
        "&.filter-group-action": {
          paddingX: "1.5",
        },
      },
      sm: {},
      md: {
        "&.filter-group-action": {
          paddingX: "2",
        },
      },
      lg: {
        "&.filter-group-action": {
          paddingX: "3",
        },
      },
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

export const styles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
  "& :is(.filter-group-action, :has(> .filter-group-action)) + :is(.filter-group-action, :has(> .filter-group-action))":
    {
      marginInlineStart: "-1.5",
    },
});
