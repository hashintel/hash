import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

/**
 * Styled per the Design System Figma (SegmentedControl/Text + /Icon,
 * node 17036:159702), with one systemic difference: every non-selected
 * surface (track bg, rings, hover wash) is "frosted" — 0.9-alpha colors
 * derived from the solid neutral palette via CSS relative color syntax, so
 * the control composites onto any surface while rendering the exact palette
 * value on the mode's canonical backdrop. Only the indicator pill fill is
 * opaque (neutral.s05), since it must occlude the track as it slides. The
 * pill is positioned by Ark UI via the `--left`/`--top`/`--width`/`--height`
 * variables it sets inline.
 *
 * The frost formula: an alpha color renders as a*C + (1-a)*B over backdrop
 * B, so C = (S - 0.1*B) / 0.9 makes it render exactly the solid step S at
 * a = 0.9. `--sc-frost-bg` holds the pre-multiplied 0.1*B term: 25.5 against
 * white in light mode, 0 against black (bg.min) in dark. Each source step is
 * the solid twin of the alpha token it replaces (a20=s20, a25=s25,
 * bd.subtle/a40=s40, bd.solid/a60=s60, and their `.disabled` slots one rung
 * down) — the alpha scale is constructed on that correspondence. Requires
 * relative-color-syntax support (baseline 2024); unsupported browsers drop
 * these declarations entirely.
 *
 * Disabled restates colors in the same system (faded ring/track, `.disabled`
 * fg slots) rather than Figma's opacity 0.5, which would break compositing
 * by fading the whole control against its backdrop.
 *
 * Sizing follows the shared form-size system (same as BaseInput/Button):
 * each size spreads `formSizes.variants.sizes.*`, so text scale and overall
 * control height match a TextInput of the same `size` — segments subtract
 * the track's 2px inset per side from the shared height formula. The track
 * radius follows BaseInput's per-size radius ladder (radii.md / lg / xl)
 * with the segment radius 2px inside it.
 */
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
      // An inset ring rather than a border, for two reasons: Ark positions
      // the indicator from the items' offsetLeft/offsetTop, which are
      // relative to the padding edge — a border would shift that coordinate
      // space by 1px. It also matches the Figma stroke, drawn inside and
      // overlapping the 2px padding.
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
    // Figma icon-only segments are square (item width = item height).
    // minWidth rather than width so vertical layouts can still stretch.
    iconOnlyItem: {
      "--sc-item-px": "[0px]",
      minWidth: "var(--sc-item-height)",
    },
    itemText: {
      display: "inline-flex",
      alignItems: "center",
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
    // Applied to the Tooltip's trigger wrapper so a tooltip-wrapped segment
    // participates in the track's flex layout exactly like a bare segment.
    tooltipTrigger: {
      display: "flex",
      flexGrow: "1",
      "& > *": {
        flexGrow: "1",
      },
    },
  },
  variants: {
    size: {
      // Label font sizes are the Figma segment typography, set on itemText
      // only: the item keeps the form-size textStyle font so the em-based
      // height formula (and the icon-only minWidth) resolve unchanged.
      xxs: {
        root: { ...formSizes.variants.sizes.xxs, "--sc-radius": "radii.md" },
        itemText: { fontSize: "[11px]" },
      },
      xs: {
        root: { ...formSizes.variants.sizes.xs, "--sc-radius": "radii.md" },
        itemText: { fontSize: "[12px]" },
      },
      sm: {
        root: { ...formSizes.variants.sizes.sm, "--sc-radius": "radii.lg" },
        itemText: { fontSize: "[14px]" },
      },
      md: {
        root: { ...formSizes.variants.sizes.md, "--sc-radius": "radii.lg" },
        itemText: { fontSize: "[14px]" },
      },
      lg: {
        root: { ...formSizes.variants.sizes.lg, "--sc-radius": "radii.xl" },
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
  },
  defaultVariants: {
    size: "md",
    layout: "horizontal",
  },
});
