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
      "--sc-item-height":
        "[calc(var(--form-line-height) * var(--leading-factor, 1) + var(--form-padding-y) * 2 + var(--form-border-width) * 2 - 4px)]",
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
      default: {},
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
