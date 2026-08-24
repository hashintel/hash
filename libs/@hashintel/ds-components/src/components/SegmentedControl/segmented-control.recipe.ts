import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const styles = sva({
  slots: [
    "root",
    "item",
    "iconOnlyItem",
    "itemText",
    "icon",
    "indicator",
    "tooltipTrigger",
  ],
  base: {
    root: {
      "--sc-item-radius": "[calc(var(--sc-radius) - 2px)]",
      // Default-variant active-pill "raise": the pill overhangs its item box on
      // every side by --sc-raise so it reads as a lifted button while keeping an
      // even gap to the track all the way around. Constant across sizes, so the
      // gap (2px track inset − --sc-raise) stays a uniform hairline everywhere.
      "--sc-raise": "[1.5px]",
      // Rounded to a whole pixel so the item box is integer-sized. zag drives the
      // active pill from the item's integer offsetWidth/offsetHeight; if the item
      // box were fractional the pill's overhanging edges would land off the item
      // by the fractional remainder, and since that remainder differs per content
      // type (text vs icon vs ellipsized) the gaps would drift between examples.
      // Integer item boxes also make every stacked offsetTop exact in the
      // vertical layout, keeping the last item's bottom gap consistent.
      "--sc-item-height":
        "[round(var(--form-line-height) * var(--leading-factor, 1) + var(--form-padding-y) * 2 + var(--form-border-width) * 2 - 4px, 1px)]",
      "--sc-frost-bg": "[25.5]",
      _dark: {
        "--sc-frost-bg": "[0]",
      },
      position: "relative",
      isolation: "isolate",
      display: "inline-flex",
      width: "[fit-content]",
      padding: "[2px]",
      gap: "[2px]",
      boxShadow:
        "[inset 0 0 0 1px rgb(from {colors.neutral.s40} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      borderRadius: "[var(--sc-radius)]",
      backgroundColor:
        "[rgb(from {colors.neutral.s20} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      userSelect: "none",
      "&[data-disabled]": {
        backgroundColor:
          "[rgb(from {colors.neutral.s15} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
        boxShadow:
          "[inset 0 0 0 1px rgb(from {colors.neutral.s20} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      },
    },
    item: {
      position: "relative",
      zIndex: "[1]",
      display: "inline-flex",
      flexGrow: "1",
      // Allow segments to shrink below their content (labels ellipsize) when
      // the control is width-constrained; icon-only segments override the var
      // to stay square.
      minWidth: "[var(--sc-item-min-w, 0px)]",
      alignItems: "center",
      justifyContent: "center",
      gap: "1",
      paddingX: "[var(--sc-item-px, 6px)]",
      minHeight: "var(--sc-item-height)",
      // Pin the line box to the item height: at xs the textStyle line-height
      // (1.6em) exceeds the item and would grow the control past the shared
      // form-size height.
      lineHeight: "[var(--sc-item-height)]",
      borderRadius: "[var(--sc-item-radius)]",
      fontWeight: "medium",
      whiteSpace: "nowrap",
      color: "fg.subtle",
      cursor: "pointer",
      transition: "[color 0.15s ease, background-color 0.15s ease]",
      "&[data-state='unchecked']:hover:not([data-disabled])": {
        color: "fg.muted.hover",
        backgroundColor:
          "[rgb(from {colors.neutral.s25} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      },
      "&[data-state='checked']": {
        color: "fg.heading",
      },
      "&[data-disabled]": {
        cursor: "unset",
        color: "fg.subtle.disabled",
      },
      "&[data-disabled][data-state='checked']": {
        color: "fg.body.disabled",
      },
      "&[data-focus-visible]": {
        outline: "[2px solid {colors.black.a40}]",
        outlineOffset: "[1px]",
      },
    },
    iconOnlyItem: {
      "--sc-item-px": "[0px]",
      "--sc-item-min-w": "var(--sc-item-height)",
    },
    itemText: {
      display: "block",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingX: "0.5",
    },
    icon: {},
    indicator: {
      "--transition-duration": "[180ms]",
      "--transition-timing-function": "[cubic-bezier(0.2, 0, 0, 1)]",
      position: "absolute",
      // border-box so the pill's own border doesn't inflate the item-sized
      // width/height Ark provides (there is no preflight border-box reset).
      boxSizing: "border-box",
      left: "var(--left)",
      top: "var(--top)",
      width: "var(--width)",
      height: "var(--height)",
      zIndex: "[0]",
      borderRadius: "[var(--sc-item-radius)]",
      backgroundColor: "neutral.s05",
      border:
        "[1px solid rgb(from {colors.neutral.s60} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      "&[data-disabled]": {
        border:
          "[1px solid rgb(from {colors.neutral.s40} calc((r - var(--sc-frost-bg)) / 0.9) calc((g - var(--sc-frost-bg)) / 0.9) calc((b - var(--sc-frost-bg)) / 0.9) / 0.9)]",
      },
    },
    tooltipTrigger: {
      display: "flex",
      flexGrow: "1",
      minWidth: "0",
      "& > *": {
        flexGrow: "1",
      },
    },
  },
  variants: {
    size: {
      // --sc-item-px scales with the size ladder (Button uses 8/8/8/12/16;
      // segments run slightly tighter since they sit inside the 2px track and
      // labels carry their own 2px). Icon-only segments zero it out on the
      // item itself, which beats this inherited value, so they stay square.
      xxs: {
        root: {
          ...formSizes.variants.sizes.xxs,
          "--sc-radius": "radii.md",
          "--sc-item-px": "[6px]",
        },
        itemText: { fontSize: "[11px]" },
      },
      xs: {
        root: {
          ...formSizes.variants.sizes.xs,
          "--sc-radius": "radii.md",
          "--sc-item-px": "[8px]",
        },
        itemText: { fontSize: "[12px]" },
      },
      sm: {
        root: {
          ...formSizes.variants.sizes.sm,
          "--sc-radius": "radii.lg",
          "--sc-item-px": "[8px]",
        },
        itemText: { fontSize: "[14px]" },
      },
      md: {
        root: {
          ...formSizes.variants.sizes.md,
          "--sc-radius": "radii.lg",
          "--sc-item-px": "[10px]",
        },
        itemText: { fontSize: "[14px]" },
      },
      lg: {
        root: {
          ...formSizes.variants.sizes.lg,
          "--sc-radius": "radii.xl",
          "--sc-item-px": "[12px]",
        },
        itemText: { fontSize: "[15px]" },
        // Same clamp as Button: the md icon step (24px) reads oversized.
        icon: { "&&": { "--icon-size": "20px" } },
      },
    },
    layout: {
      horizontal: {},
      vertical: {
        root: {
          flexDirection: "column",
        },
      },
    },
    variant: {
      default: {
        // The active pill reads as a raised button sitting on the track: it
        // overhangs the item box by --sc-raise on every side, leaving an even
        // hairline gap to the track all the way around, and a whisper of
        // down-right drop shadow sells the lift. Black alphas are true shadows
        // and must NOT take the frost treatment.
        //
        // The top-left shift uses negative margins, NOT left/top overrides:
        // zag pins the main-axis position inline (`left` when horizontal, `top`
        // when vertical), which beats a recipe class, so overriding left/top
        // would only move the cross axis and the overhang would come out uneven
        // (and differ between orientations). Margins are never set inline, so
        // they shift both axes consistently. Width/height then grow by twice
        // --sc-raise so the bottom-right corner overhangs by the same amount as
        // the top-left, keeping the gap symmetric.
        indicator: {
          marginTop: "[calc(-1 * var(--sc-raise))]",
          marginLeft: "[calc(-1 * var(--sc-raise))]",
          width: "[calc(var(--width) + 2 * var(--sc-raise))]",
          height: "[calc(var(--height) + 2 * var(--sc-raise))]",
          boxShadow:
            "[0 1px 1.5px {colors.black.a10}, 1px 1px 1px {colors.black.a05}]",
          "&[data-disabled]": {
            boxShadow: "[none]",
          },
        },
      },
      embossed: {
        root: {
          backgroundColor:
            "[color-mix(in srgb, {colors.neutral.s10} 15%, transparent)]",
          boxShadow:
            "[inset 0 1px 2.5px {colors.neutral.a50}, inset 0 0 1px {colors.neutral.a45}]",
          "&[data-disabled]": {
            backgroundColor: "[transparent]",
            boxShadow:
              "[inset 0 1px 2.5px {colors.neutral.a30}, inset 0 0 1px {colors.neutral.a25}]",
          },
        },
        // The embossed track is a deeper recess than default's, so the selected
        // pill gets a subtle elevation to read as raised out of the well rather
        // than sitting flat in it: a soft drop shadow plus a faint top highlight
        // (light from above). Kept deliberately gentle. Black/white alphas here
        // are true shadows and must NOT take the frost treatment.
        indicator: {
          boxShadow:
            "[0 1px 2px -1px {colors.black.a15}, 0 1px 1px -1px {colors.black.a10}, inset 0 1px 0 {colors.white.a50}]",
          _dark: {
            boxShadow:
              "[0 1px 1px {colors.black.a40}, inset 0 1px 0 {colors.white.a20}]",
          },
          "&[data-disabled]": {
            boxShadow: "[none]",
          },
        },
      },
    },
  },
  compoundVariants: [
    {
      // Vertical + default: the cross axis is now width, and the items differ in
      // width by content (full-width text vs square icons), so the rounded
      // --width would give them mismatched right gaps. Span the pill between
      // track-relative left/right insets instead — independent of the item's
      // measured width — each overhanging the item box by --sc-raise so the
      // left/right gaps are exact, symmetric, and identical for every content
      // type. (The main axis, height, still comes from the base default; it's
      // exact now that the item box is integer.)
      variant: "default",
      layout: "vertical",
      css: {
        indicator: {
          marginLeft: "[0px]",
          left: "[calc(var(--left) - var(--sc-raise))]",
          right: "[calc(2px - var(--sc-raise))]",
          width: "[auto]",
        },
      },
    },
    {
      // The pill is physically smaller at xs, so the default drop shadow reads
      // heavier relative to it; lighten and tighten it a touch so it stays a
      // whisper. Disabled still gets no shadow from the base default rule (its
      // [data-disabled] selector outranks this plain override). xxs shrinks it
      // further below.
      variant: "default",
      size: "xs",
      css: {
        indicator: {
          boxShadow:
            "[0 1px 1px {colors.black.a05}, 0.5px 0.5px 1px {colors.black.a05}]",
        },
      },
    },
    {
      // xxs is smaller still: a05 is already the faintest alpha step, so drop
      // the down-right directional layer entirely and halve the ambient offset,
      // leaving just a barely-there hint of lift.
      variant: "default",
      size: "xxs",
      css: {
        indicator: {
          boxShadow: "[0 0.5px 1px {colors.black.a05}]",
        },
      },
    },
    {
      // Same track-relative cross-axis span for embossed vertical — its pill has
      // no raise/far, so left stays at var(--left) and right pins to the 2px
      // track inset, giving exact, symmetric left/right gaps for full-width text
      // and square icon controls alike.
      variant: "embossed",
      layout: "vertical",
      css: {
        indicator: {
          right: "[2px]",
          width: "[auto]",
        },
      },
    },
    {
      variant: "embossed",
      size: ["xxs", "xs"],
      css: {
        root: {
          boxShadow:
            "[inset 0 1px 2px {colors.neutral.a50}, inset 0 0 1px {colors.neutral.a45}]",
          "&[data-disabled]": {
            boxShadow:
              "[inset 0 1px 2px {colors.neutral.a30}, inset 0 0 1px {colors.neutral.a25}]",
          },
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    layout: "horizontal",
    variant: "default",
  },
});
