import { cva, sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";
import { formWidths } from "../../util/form-width.recipe";

// Shared by the preset width variants (duplicated in base-input.recipe.ts and
// select.recipe.ts — Panda can only extract same-file spreads): the wrapper
// holds the preset against flex siblings but yields to containers narrower
// than it.
const presetWidthWrapper = {
  maxWidth: "[100%]",
  minWidth: "[max(var(--form-min-width), min(var(--form-width), 100%))]",
} as const;
const presetWidthFrame = {
  maxWidth: "[100%]",
  minWidth: "var(--form-min-width)",
} as const;

export const comboboxDropdownRecipe = cva({
  base: {
    // At least as wide as the input's visible box, growing to fit item
    // content up to 18rem. !important beats the SelectableList content
    // min-width (140px).
    ...formWidths.base,
    "--combobox-list-reference-width":
      "calc(var(--reference-width) + var(--combobox-list-anchor-inset, 0px) * 2)",
    width: "[fit-content]",
    minWidth:
      "[max(var(--combobox-list-reference-width), var(--form-min-width)) !important]",
    maxWidth: "[max(var(--combobox-list-reference-width), 18rem)]",
    marginLeft: "[calc(-1 * var(--combobox-list-anchor-inset, 0px))]",
    // Items need the same inter-item gap as Menu lists so that adjacent
    // highlight-style selections read as separate rows (matches multi Select)
    "& [data-part='item'] + [data-part='item']": {
      marginTop: "[1px]",
    },
  },
  variants: {
    variant: {
      default: {},
      subtle: {
        // A subtle input's visible box (its hover/focus ::before) extends one
        // padding-x beyond the anchor rect on each side; widen and shift the
        // list by the same inset. Matches the subtle input's
        // --base-input-padding-x, which is spacing.2 at every size.
        "--combobox-list-anchor-inset": "spacing.2",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

// The default "commit typed text" option row: a plus icon beside the raw
// input, the icon one size smaller than a regular item icon.
export const comboboxNewValueOptionRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1.5",
  },
});

// Custom-rendered chip content in the selected-values row. Inline-flex keeps
// a block-level `renderItem` result (e.g. a `display: flex` wrapper) on the
// chip's single line box — a block child would stack under the chip's
// height-stabilizing zero-width space and double the chip's height.
export const comboboxChipContentRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    minWidth: "0",
  },
});

/**
 * The multiple combobox's input frame. Unlike the single variant (a
 * BaseInput), the multi variant composes an OverflowRow — the selected-value
 * chips and the typed-text input in one row — inside this frame, which
 * re-creates the BaseInput chrome it forgoes: border, hover and focus
 * states, sizes, widths, the clear button and the loading spinner.
 */
export const comboboxMultiRecipe = sva({
  slots: [
    "wrapper",
    "frame",
    "row",
    "customSelection",
    "clear",
    "clearIcon",
    "hideClear",
    "loading",
    "readonly",
  ],
  base: {
    wrapper: {
      ...formWidths.base,
      display: "inline-flex",
      position: "relative",
    },
    frame: {
      display: "flex",
      alignItems: "center",
      cursor: "text",
      width: "[100%]",
      minWidth: "var(--form-min-width)",
      position: "relative",
      background: "[var(--base-input-background-color)]",
      borderWidth: "var(--form-border-width)",
      borderStyle: "solid",
      borderColor: "[transparent]",
      borderRadius: "var(--base-input-border-radius)",
      transition: "[background 0.15s ease, border 0.15s ease]",
      "--base-input-background-color": "var(--colors-white)",
      "--base-input-focus-color": "var(--colors-neutral-s40)",
      "--base-input-border-color": "var(--colors-neutral-s40)",
      "--base-input-border-hover-color": "var(--colors-neutral-s80)",
      "&:not(.layer-style_disabled):hover [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      "&:focus-within [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      // The row's input drives the frame's height, exactly as a BaseInput's
      // own input does — the (slightly taller, centered) chips then overlap
      // the padding zone rather than stacking onto it. The input keeps the
      // combobox machine's role even though the tags machine renders it.
      "& input[role='combobox']": {
        paddingY: "var(--form-padding-y)",
      },
      // The gap between the last chip and the typed text: the row's own item
      // gap plus this margin equals the chip inset (see chipInsetMap), so the
      // trailing gap matches the leading one. Alone on the row (no chips) the
      // input keeps its `:first-child` zero margin.
      "& input[role='combobox']:not(:first-child)": {
        marginLeft:
          "[calc(var(--before-input-inset, var(--spacing-1)) - var(--overflow-row-gap, var(--spacing-1)))]",
      },
    },
    // The OverflowRow hosting the chips and the typed-text input
    row: {
      flex: "1",
      minWidth: "0",
    },
    // A `renderSelectedItem` custom node, sharing the frame with the
    // (item-less) row that still hosts the input
    customSelection: {
      display: "flex",
      alignItems: "center",
      minWidth: "0",
      flex: "[0 1 auto]",
      marginRight: "1",
    },
    clear: {
      position: "absolute",
      zIndex: "[1]",
      right: "2",
      display: "flex",
      alignItems: "center",
      opacity: "0",
      // We set visibility and opacity because visibility prevents the clear button from being the first focus target
      // when focusing backwards but opacity allows us to add a transition animation
      visibility: "hidden",
      transition: "[opacity 0.08s ease]",
      color: "neutral.s110",
      cursor: "pointer",
      _hover: { color: "neutral.s125" },
      _focus: { _after: { background: "neutral.s30" }, outline: "none" },
      _before: {
        content: "'\\200B'",
        position: "absolute",
        paddingY: "[var(--form-padding-y)]",
        insetX: "0",
        background: "[var(--base-input-background-color)]",
        zIndex: "[-2]",
        borderRightRadius: "var(--base-input-border-radius)",
      },
      _after: {
        content: "''",
        position: "absolute",
        borderRadius: "full",
        inset: "0",
        zIndex: "[-1]",
      },
    },
    clearIcon: {
      padding: "0.5",
    },
    hideClear: {
      visibility: "hidden !important",
    },
    loading: {
      alignSelf: "center",
      paddingRight: "2",
      position: "relative",
    },
    readonly: {
      display: "inline",
    },
  },
  variants: {
    variant: {
      default: {
        frame: {
          borderColor: "var(--base-input-border-color)",
          color: "fg.body",
          "&:not(.layer-style_disabled):hover": {
            borderColor: "var(--base-input-border-hover-color)",
            "--base-input-background-color": "var(--colors-neutral-s10)",
          },
          "&:focus-within:not(.layer-style_disabled)": {
            outline: "[1px solid var(--base-input-focus-color)]",
          },
        },
      },
      subtle: {
        frame: {
          "--base-input-border-hover-color": "var(--colors-neutral-a40)",
          "--base-input-background-color": "transparent",
          _before: {
            content: '""',
            position: "absolute",
            insetY: "[-1px]",
            insetX: "[calc(-1 * var(--base-input-padding-x))]",
            borderRadius: "var(--base-input-border-radius)",
            border: "1px solid transparent",
            pointerEvents: "none",
            background: "[var(--base-input-background-color)]",
            transition: "[background 0.15s ease, border 0.15s ease]",
          },
          "&:not(.layer-style_disabled):hover": {
            _before: {
              borderColor: "var(--base-input-border-hover-color)",
            },
          },
          "&:focus-within:not(.layer-style_disabled)": {
            "--base-input-background-color": "var(--colors-white)",
            _before: {
              borderColor: "var(--base-input-border-color)",
            },
          },
        },
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-2))]",
        },
      },
    },
    size: {
      xxs: {
        wrapper: {
          ...formSizes.variants.sizes.xxs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xxs.textStyle },
      },
      xs: {
        wrapper: {
          ...formSizes.variants.sizes.xs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xs.textStyle },
      },
      sm: {
        wrapper: {
          ...formSizes.variants.sizes.sm,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.2.5",
        },
        readonly: { textStyle: formSizes.variants.sizes.sm.textStyle },
      },
      md: {
        wrapper: {
          ...formSizes.variants.sizes.md,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.3",
        },
        readonly: { textStyle: formSizes.variants.sizes.md.textStyle },
      },
      lg: {
        wrapper: {
          ...formSizes.variants.sizes.lg,
          "--base-input-border-radius": "radii.xl",
          "--base-input-padding-x": "spacing.4",
        },
        readonly: { textStyle: formSizes.variants.sizes.lg.textStyle },
      },
    },
    invalid: {
      true: {
        frame: {
          "--base-input-focus-color": "var(--colors-red-s60)",
          "--base-input-border-color": "var(--colors-red-s60)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
        },
      },
    },
    disabled: {
      true: {
        frame: {
          ...({ layerStyle: "disabled" } as Record<string, string>),
          cursor: "auto",
        },
      },
    },
    width: {
      xs: {
        wrapper: { ...presetWidthWrapper, ...formWidths.variants.widths.xs },
        frame: presetWidthFrame,
      },
      sm: {
        wrapper: { ...presetWidthWrapper, ...formWidths.variants.widths.sm },
        frame: presetWidthFrame,
      },
      md: {
        wrapper: { ...presetWidthWrapper, ...formWidths.variants.widths.md },
        frame: presetWidthFrame,
      },
      lg: {
        wrapper: { ...presetWidthWrapper, ...formWidths.variants.widths.lg },
        frame: presetWidthFrame,
      },
      fullWidth: {
        wrapper: {
          ...formWidths.variants.widths.fullWidth,
          width: "[100%]",
        },
        frame: {
          width: "[100%]",
        },
      },
      fitContent: {
        wrapper: { ...formWidths.variants.widths.fitContent },
        frame: {
          width: "[fit-content]",
          minWidth: "[unset]",
        },
        readonly: { width: "[fit-content]" },
      },
    },
    // The frame's horizontal padding. A chip row is inset by
    // `--before-input-inset` — set per size to the vertical gap the centered
    // chips leave to the frame's top/bottom (see chipInsetMap), so the chips
    // sit evenly inset on all four sides; text-like content (an empty
    // selection's placeholder, the `summary` mode, a custom
    // renderSelectedItem) keeps the input's normal text inset instead.
    contentInset: {
      chips: {
        frame: {
          paddingX: "[var(--before-input-inset, var(--spacing-1))]",
        },
      },
      text: {
        frame: {
          paddingX: "var(--base-input-padding-x)",
        },
      },
    },
    loading: {
      true: {
        clear: {
          right: "1.5",
        },
      },
    },
  },
  compoundVariants: [
    {
      variant: "default",
      disabled: true,
      css: {
        frame: {
          "--base-input-border-color": "var(--colors-neutral-s50)",
          "--base-input-background-color": "var(--colors-neutral-s20)",
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "subtle",
      disabled: true,
      css: {
        frame: {
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "default",
      invalid: true,
      css: {
        frame: {
          "&:not(.layer-style_disabled):hover": {
            "--base-input-background-color": "var(--colors-red-s05)",
          },
        },
      },
    },
    {
      variant: "subtle",
      invalid: true,
      css: {
        frame: {
          _before: {
            borderColor: "var(--base-input-border-color)",
          },
        },
      },
    },
    {
      variant: "subtle",
      loading: true,
      css: {
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-1\\.5))]",
        },
      },
    },
    {
      variant: "subtle",
      size: "xxs",
      css: { frame: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "xs",
      css: { frame: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "sm",
      css: { frame: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "md",
      css: { frame: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "lg",
      css: { frame: { "--base-input-padding-x": "spacing.2" } },
    },
  ],
  defaultVariants: {
    variant: "default",
    size: "md",
    width: "fullWidth",
    contentInset: "chips",
  },
});
