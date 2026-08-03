import { css, cva } from "@hashintel/ds-helpers/css";

export const badgeVariants = ["fill", "outline"] as const;
export type BadgeVariant = (typeof badgeVariants)[number];

// The `position: relative` wrapper around the anchor (`children`), so the badge
// overhangs the anchor's corner rather than the whole viewport.
export const badgeWrapper = css({
  position: "relative",
  display: "inline-flex",
});

// The badge itself: a small status pill (e.g. "99+") that overhangs a corner of
// the wrapper like a styled sup/sub. It's a passive overlay
// (pointer-events: none) unless clickable, so it never swallows clicks meant
// for the anchor it decorates. With no `content` it collapses to a small dot.
export const badgeRecipe = cva({
  base: {
    position: "absolute",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5",
    boxSizing: "border-box",
    flexShrink: "0",
    minWidth: "[var(--badge-size)]",
    height: "[var(--badge-size)]",
    paddingInline: "var(--spacing-1)",
    fontFamily: "body",
    fontSize: "xxs",
    fontWeight: "semibold",
    lineHeight: "[1]",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
    border: "1px solid transparent",
    borderRadius: "[var(--badge-radius)]",
    outline: "none",
    "--badge-size": "[16px]",
    "--badge-radius": "var(--radii-sm)",
    "--badge-ring-color":
      "[color-mix(in oklab, var(--colors-color-palette-fg-link) 65%, transparent)]",
    transition:
      "[background 0.15s ease, color 0.15s ease, border-color 0.15s ease]",
  },
  variants: {
    color: {
      grey: { colorPalette: "neutral" },
      red: { colorPalette: "red" },
      blue: { colorPalette: "blue" },
      green: { colorPalette: "green" },
      orange: { colorPalette: "orange" },
      yellow: { colorPalette: "yellow" },
      purple: { colorPalette: "purple" },
      pink: { colorPalette: "pink" },
    },
    variant: {
      fill: {
        background: "colorPalette.bgSolid.solid",
        color: "colorPalette.fg.onSolid",
      },
      outline: {
        background: "white",
        borderColor: "colorPalette.bd.solid",
        color: "colorPalette.fg.link",
      },
    },
    shape: {
      default: {},
      round: { "--badge-radius": "var(--radii-full)" },
    },
    // Centre the badge on the chosen corner of the wrapper.
    position: {
      "top-left": { top: "0", left: "0", transform: "[translate(-50%, -50%)]" },
      "top-right": {
        top: "0",
        right: "0",
        transform: "[translate(50%, -50%)]",
      },
      "bottom-left": {
        bottom: "0",
        left: "0",
        transform: "[translate(-50%, 50%)]",
      },
      "bottom-right": {
        bottom: "0",
        right: "0",
        transform: "[translate(50%, 50%)]",
      },
    },
    // Content-less: collapse to a small round dot.
    dot: {
      true: {
        "--badge-size": "[8px]",
        "--badge-radius": "var(--radii-full)",
        paddingInline: "0",
      },
    },
    clickable: {
      true: {
        cursor: "pointer",
        appearance: "none",
        pointerEvents: "auto",
        "&:focus-visible": {
          boxShadow: "[0 0 0 2px var(--badge-ring-color)]",
        },
      },
    },
  },
  compoundVariants: [
    {
      clickable: true,
      variant: "fill",
      css: { _hover: { background: "colorPalette.bgSolid.solid.hover" } },
    },
    {
      clickable: true,
      variant: "outline",
      css: {
        _hover: {
          borderColor: "colorPalette.bd.solid.hover",
          color: "colorPalette.fg.link.hover",
        },
      },
    },
  ],
  defaultVariants: {
    color: "grey",
    variant: "fill",
    shape: "default",
    position: "top-right",
  },
});
