import { cva, sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

/**
 * Per-size `--filter-font-size` declarations shared by the Filter chip and
 * the FilterGroup action buttons. Recipes spread
 * `filterFontSizes.variants.sizes.<size>` into their own size variants —
 * the same pattern as `formSizes` in `../../util/form-size.recipe.ts`.
 */
export const filterFontSizes = {
  variants: {
    sizes: {
      xxs: { "--filter-font-size": "var(--font-sizes-xxs)" },
      xs: { "--filter-font-size": "[11px]" },
      sm: { "--filter-font-size": "[12px]" },
      md: { "--filter-font-size": "[14px]" },
      lg: { "--filter-font-size": "var(--font-sizes-base)" },
    },
  },
} as const;

// Do not use this export! We only need to export this as a recipe for panda
// to be able to properly analyze and share styles
export const filterFontSizesRecipe = cva(filterFontSizes);

/**
 * Chip-like segmented shell: [property | operator ▾ | input…]. Each segment
 * draws its own real borders: top/bottom (plus the first segment's left and
 * the last segment's right, with the corner radii) read
 * `--filter-outer-border` and together form the chip's outline, while every
 * other segment's left border reads `--filter-divider` and draws the
 * internal hairline. The root only rounds/clips; hover and state changes
 * re-point the levers. The focus ring escapes the root's clip via
 * `:has(:focus-visible) { overflow: visible }` (a clip would swallow it).
 */
export const filterRecipe = sva({
  slots: [
    "root",
    "property",
    "trigger",
    "triggerLabel",
    "inputSlot",
    "input",
    "separator",
    "remove",
    "errorTooltip",
    "errorRow",
    "errorIcon",
  ],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "stretch",
      width: "[fit-content]",
      maxWidth: "[100%]",
      whiteSpace: "nowrap",
      background: "white",
      fontWeight: "medium",
      borderRadius: "[var(--filter-radius)]",
      overflow: "clip",
      isolation: "isolate",
      "--filter-outer-border": "var(--colors-neutral-s50)",
      "--filter-divider": "var(--colors-neutral-s40)",
      "--filter-remove-divider": "var(--colors-neutral-s40)",
      "--filter-hover-border": "var(--colors-neutral-s80)",
      "--filter-pressed-border": "var(--colors-neutral-s70)",
      "--filter-input-hover-bg": "var(--colors-neutral-s10)",
      "--filter-ring": "var(--colors-neutral-a80)",
      "--filter-property-padding-x": "var(--filter-padding-x)",
      "--filter-input-padding-x": "var(--filter-padding-x)",
      _hover: {
        "--filter-outer-border": "var(--colors-neutral-s60)",
        "--filter-divider": "var(--colors-neutral-s50)",
        "--filter-remove-divider": "var(--colors-neutral-s50)",
      },
      "&:focus-within": {
        "--filter-outer-border": "var(--colors-neutral-s60)",
      },
      "&:has([data-part=remove]:hover:not(:disabled))": {
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      "&:has(:focus-visible)": {
        overflow: "visible",
      },
    },
    property: {
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flexShrink: "2",
      minWidth: "[4ch]",
      fontSize: "[var(--filter-font-size)]",
      paddingInline: "var(--filter-property-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      color: "neutral.s115",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart:
        "var(--form-border-width) solid var(--filter-outer-border)",
      borderStartStartRadius: "[var(--filter-radius)]",
      borderEndStartRadius: "[var(--filter-radius)]",
      transition: "[border-color 0.15s ease]",
    },
    trigger: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "neutral.s110",
      fontSize: "[var(--filter-font-size)]",
      fontWeight: "normal",
      display: "inline-flex",
      alignItems: "center",
      gap: "1",
      position: "relative",
      flexShrink: "2",
      minWidth: "[5ch]",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      cursor: "pointer",
      outline: "none",
      "& svg": {
        flexShrink: "0",
      },
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[background 0.15s ease, border-color 0.15s ease]",
      _hover: {
        background: "neutral.s25",
      },
      "&[data-state=open], &[data-state=open]:hover": {
        boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
      },
      "&[data-state=open]": {
        background: "neutral.s20",
      },
      "&[data-state=open]:hover": {
        background: "neutral.s25",
      },
      "&[data-state=open]:not(:hover)": {
        "--filter-divider": "var(--filter-pressed-border)",
        "--filter-outer-border": "var(--filter-pressed-border)",
      },
      "&[data-state=open]:not(:hover) + *": {
        "--filter-divider": "var(--filter-pressed-border)",
        "--filter-remove-divider": "var(--filter-pressed-border)",
      },
      "&:hover:not(:disabled)": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      "&:hover:not(:disabled) + *": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-remove-divider": "var(--filter-hover-border)",
      },
      "&:focus-visible": {
        zIndex: "[1]",
      },
      "&:focus-visible::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "[3px]",
        boxShadow: "[0 0 0 2px var(--filter-ring)]",
        pointerEvents: "none",
      },
      "&[data-placeholder]": {
        color: "neutral.s90",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
    },
    triggerLabel: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    },
    inputSlot: {
      display: "inline-flex",
      minWidth: "0",
      alignItems: "stretch",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[border-color 0.15s ease, background 0.15s ease]",
      fontSize: "[var(--filter-font-size)]",
      maxWidth: "[min(calc(32ch + 2 * var(--filter-input-padding-x)), 100%)]",
      "&:hover:not([data-disabled])": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
        background: "[var(--filter-input-hover-bg)]",
      },
      "&:hover:not([data-disabled]) + *": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-remove-divider": "var(--filter-hover-border)",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
      "&:focus-within": {
        flexShrink: "0.01",
        background: "white",
      },
    },
    input: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      outline: "none",
      paddingInline: "var(--filter-input-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      font: "inherit",
      fontSize: "[var(--filter-font-size)]",
      color: "neutral.s115",
      fieldSizing: "content",
      minWidth: "[calc(2 * var(--filter-input-padding-x))]",
      maxWidth: "[min(calc(32ch + 2 * var(--filter-input-padding-x)), 100%)]",
      textAlign: "center",
      textOverflow: "ellipsis",
      _focus: {
        textAlign: "left",
        textOverflow: "clip",
      },
      "&::placeholder": {
        color: "[currentColor]",
        opacity: "[0.4]",
      },
      "&:disabled": {
        cursor: "auto",
      },
      "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
        display: "none",
      },
    },
    separator: {
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      fontSize: "[var(--filter-font-size)]",
      fontWeight: "normal",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      color: "neutral.s100",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[border-color 0.15s ease]",
    },
    remove: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "neutral.s115",
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      position: "relative",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      cursor: "pointer",
      outline: "none",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart:
        "var(--form-border-width) solid var(--filter-remove-divider)",
      transition: "[background 0.15s ease, border-color 0.15s ease]",
      _hover: {
        background: "neutral.s25",
      },
      "&:hover:not(:disabled)": {
        "--filter-remove-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      "&:focus-visible": {
        zIndex: "[1]",
      },
      "&:focus-visible::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "[3px]",
        boxShadow: "[0 0 0 2px var(--filter-ring)]",
        pointerEvents: "none",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
    },
    // The error tooltip is portaled, so it inherits nothing from the root
    // (no `--filter-*` levers) and styles itself with direct tokens.
    errorTooltip: {
      display: "flex",
      flexDirection: "column",
      gap: "0.5",
      background: "white",
      color: "red.s100",
      fontFamily: "body",
      fontWeight: "normal",
      textStyle: "xs",
      maxWidth: "[300px]",
      paddingInline: "2",
      paddingBlock: "1",
      borderRadius: "md",
      border: "1px solid var(--colors-red-s50)",
      boxShadow: "[0 2px 6px rgba(0, 0, 0, 0.08)]",
      wordWrap: "break-word",
    },
    errorRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: "1",
      minWidth: "0",
    },
    errorIcon: {
      flexShrink: "0",
      width: "[1em !important]",
      minWidth: "[1em !important]",
      height: "[1em !important]",
      // Optically centers the icon on the first line of a wrapped message
      marginTop: "[0.2em]",
    },
  },
  variants: {
    size: {
      xxs: {
        root: {
          ...formSizes.variants.sizes.xxs,
          ...filterFontSizes.variants.sizes.xxs,
          "--filter-padding-x": "[5px]",
          "--filter-property-padding-x": "[5px]",
          "--filter-radius": "var(--radii-sm)",
        },
        errorTooltip: { textStyle: "xxs" },
      },
      xs: {
        root: {
          ...formSizes.variants.sizes.xs,
          ...filterFontSizes.variants.sizes.xs,
          "--filter-padding-x": "[5px]",
          "--filter-property-padding-x": "var(--spacing-1\\.5)",
          "--filter-input-padding-x": "[7px]",
          "--filter-radius": "[5px]",
        },
        errorTooltip: { textStyle: "xxs" },
      },
      sm: {
        root: {
          ...formSizes.variants.sizes.sm,
          ...filterFontSizes.variants.sizes.sm,
          "--filter-padding-x": "[7px]",
          "--filter-property-padding-x": "[7px]",
          "--filter-radius": "[5px]",
        },
      },
      md: {
        root: {
          ...formSizes.variants.sizes.md,
          ...filterFontSizes.variants.sizes.md,
          "--filter-padding-x": "[11px]",
          "--filter-property-padding-x": "[9px]",
          "--filter-radius": "var(--radii-md)",
        },
      },
      lg: {
        root: {
          ...formSizes.variants.sizes.lg,
          ...filterFontSizes.variants.sizes.lg,
          "--filter-padding-x": "[11px]",
          "--filter-property-padding-x": "[11px]",
          "--filter-radius": "var(--radii-md)",
        },
        errorTooltip: { textStyle: "sm" },
      },
    },
    invalid: {
      true: {
        root: {
          "--filter-outer-border": "var(--colors-red-s60)",
          "--filter-divider": "var(--colors-red-s40)",
          "--filter-remove-divider": "var(--colors-red-s40)",
          "--filter-hover-border": "var(--colors-red-s80)",
          "--filter-pressed-border": "var(--colors-red-s70)",
          "--filter-ring": "var(--colors-red-a80)",
          _hover: {
            "--filter-outer-border": "var(--colors-red-s60)",
            "--filter-divider": "var(--colors-red-s40)",
            "--filter-remove-divider": "var(--colors-red-s40)",
          },
          "&:focus-within": {
            "--filter-outer-border": "var(--colors-red-s60)",
          },
        },
        property: { color: "red.s115" },
        trigger: {
          color: "red.s115",
          "&[data-placeholder]": { color: "red.s80" },
        },
        input: { color: "red.s115" },
        separator: { color: "red.s115" },
        remove: { color: "neutral.s120" },
      },
    },
    complete: {
      true: {
        root: {
          "&:not(:hover):not(:focus-within)": {
            "--filter-divider": "var(--colors-neutral-s30)",
          },
        },
      },
    },
    disabled: {
      true: {
        root: {
          background: "neutral.s20",
          _hover: {
            "--filter-outer-border": "var(--colors-neutral-s50)",
            "--filter-divider": "var(--colors-neutral-s40)",
            "--filter-remove-divider": "var(--colors-neutral-s40)",
          },
        },
        property: { color: "neutral.s90" },
        trigger: {
          cursor: "auto",
          color: "neutral.s90",
          _hover: { background: "[transparent]" },
          "&[data-placeholder]": { color: "neutral.s80" },
        },
        input: { color: "neutral.s90" },
        separator: { color: "neutral.s80" },
        remove: { background: "white" },
      },
    },
  },
  compoundVariants: [
    {
      invalid: true,
      complete: true,
      css: {
        root: {
          "&:not(:hover):not(:focus-within)": {
            "--filter-divider": "var(--colors-red-s30)",
          },
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    invalid: false,
    disabled: false,
    complete: false,
  },
});
