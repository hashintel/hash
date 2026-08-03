import { css, cva } from "@hashintel/ds-helpers/css";

// The `position: relative` wrapper around the anchor (`children`), so the badge
// overhangs the anchor's corner rather than the whole viewport.
export const badgeWrapper = css({
  position: "relative",
  display: "inline-flex",
});

// The badge itself: a small status pill (e.g. "99+") that overhangs a corner of
// the wrapper like a styled sup/sub. It's a passive overlay
// (pointer-events: none), so it never swallows clicks meant for the anchor it
// decorates. With no `content` it collapses to a small dot.
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
    background: "[var(--badge-bg)]",
    border: "[1px solid var(--badge-bd)]",
    borderRadius: "[var(--badge-radius)]",
    "--badge-size": "[16px]",
    "--badge-radius": "var(--radii-sm)",
  },
  variants: {
    // Each colour is a light tint background (s30) with a saturated text colour
    // (s110, except orange's brighter s90 and grey's near-black s120) and a
    // slightly deeper border tint (`--badge-bd`).
    color: {
      grey: {
        "--badge-bg": "var(--colors-neutral-s30)",
        "--badge-bd": "var(--colors-neutral-s50)",
        color: "neutral.s120",
      },
      red: {
        "--badge-bg": "var(--colors-red-s30)",
        "--badge-bd": "var(--colors-red-s40)",
        color: "red.s110",
      },
      blue: {
        "--badge-bg": "var(--colors-blue-s30)",
        "--badge-bd": "var(--colors-blue-s45)",
        color: "blue.s110",
      },
      green: {
        "--badge-bg": "var(--colors-green-s30)",
        "--badge-bd": "var(--colors-green-s50)",
        color: "green.s110",
      },
      orange: {
        "--badge-bg": "var(--colors-orange-s30)",
        "--badge-bd": "var(--colors-orange-s45)",
        color: "orange.s90",
      },
      yellow: {
        "--badge-bg": "var(--colors-yellow-s30)",
        "--badge-bd": "var(--colors-yellow-s40)",
        color: "yellow.s110",
      },
      purple: {
        "--badge-bg": "var(--colors-purple-s30)",
        "--badge-bd": "var(--colors-purple-s45)",
        color: "purple.s110",
      },
      pink: {
        "--badge-bg": "var(--colors-pink-s30)",
        "--badge-bd": "var(--colors-pink-s40)",
        color: "pink.s110",
      },
    },
    shape: {
      square: {},
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
    // Content-less: collapse to a small round dot of the solid accent colour
    // (the tint fill would be near-invisible at this size). `--badge-bd:
    // transparent` drops the outline border so the dot stays a clean circle.
    dot: {
      true: {
        "--badge-size": "[8px]",
        "--badge-radius": "var(--radii-full)",
        "--badge-bd": "[transparent]",
        background: "[currentColor]",
        paddingInline: "0",
      },
    },
  },
  defaultVariants: {
    color: "grey",
    shape: "round",
    position: "top-right",
  },
});
