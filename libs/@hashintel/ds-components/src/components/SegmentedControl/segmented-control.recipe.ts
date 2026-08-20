import { sva } from "@hashintel/ds-helpers/css";

/**
 * Styled per the Design System Figma (SegmentedControl/Text + /Icon,
 * node 17036:159702): a #f9f9f9 (neutral.s20) track with a 2px inset and an
 * inside stroke, holding a flat near-white (neutral.s05) indicator pill with
 * a bd.solid border. The indicator is positioned by Ark UI via the
 * `--left`/`--top`/`--width`/`--height` variables it sets inline.
 *
 * Figma defines control heights xs=24 / sm=28 / md=32 (item = height - 4px);
 * xxs=20 and lg=36 extrapolate that 4px ladder. Text is 14px medium for
 * sm/md, 12px for xs, leading-none. Segment radius is radii.md (xxs/xs) or
 * radii.lg (sm+), track radius = segment radius + 2px inset.
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
      "--sc-radius": "[calc(var(--sc-item-radius) + 2px)]",
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
      boxShadow: "[inset 0 0 0 1px {colors.bd.subtle}]",
      borderRadius: "[var(--sc-radius)]",
      backgroundColor: "neutral.s20",
      userSelect: "none",
      "&[data-disabled]": {
        opacity: "0.5",
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
      borderRadius: "[var(--sc-item-radius)]",
      fontWeight: "medium",
      lineHeight: "none",
      whiteSpace: "nowrap",
      color: "fg.subtle",
      cursor: "pointer",
      transition: "[color 0.15s ease, background-color 0.15s ease]",
      "&[data-state='unchecked']:hover:not([data-disabled])": {
        color: "fg.muted.hover",
        backgroundColor: "neutral.s05",
      },
      "&[data-state='checked']": {
        color: "fg.heading",
      },
      "&[data-disabled]": {
        cursor: "unset",
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
      border: "[1px solid {colors.bd.solid}]",
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
      xxs: {
        root: {
          "--sc-item-radius": "radii.md",
          "--sc-item-height": "[16px]",
          fontSize: "[11px]",
        },
      },
      xs: {
        root: {
          "--sc-item-radius": "radii.md",
          "--sc-item-height": "[20px]",
          fontSize: "[12px]",
        },
        // Figma xs segments use 14px icons; the Icon component has no 14px
        // step. && outranks the Icon recipe's own --icon-size class, which
        // ties on specificity.
        icon: { "&&": { "--icon-size": "14px" } },
      },
      sm: {
        root: {
          "--sc-item-radius": "radii.lg",
          "--sc-item-height": "[24px]",
          fontSize: "[14px]",
        },
      },
      md: {
        root: {
          "--sc-item-radius": "radii.lg",
          "--sc-item-height": "[28px]",
          fontSize: "[14px]",
        },
      },
      lg: {
        root: {
          "--sc-item-radius": "radii.lg",
          "--sc-item-height": "[32px]",
          fontSize: "[15px]",
        },
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
