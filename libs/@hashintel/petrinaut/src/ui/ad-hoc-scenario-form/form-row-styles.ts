/**
 * The styles only the scenario form's tables use, beside the kit's
 * `form-table.ts`: the palette of the row kinds and the tints they paint,
 * the identifier column header, the dependency highlight, the read-only name
 * and type cells and the quieter gutter of the Variables lists.
 */

import { css } from "@hashintel/ds-helpers/css";

/**
 * The palette of the form's row kinds. A kind sets two custom properties on
 * its `<tr>`: `--adhoc-row-rgb`, the kind's tint, and `--adhoc-accent-rgb`,
 * the base every interactive shade derives from. The kit's cell styles and
 * the two tints below read them, so every state of a row is a shade of one
 * colour, the tint at `/ 0.08` on data cells and `/ 0.16` on the gutter and
 * count strip, and combinations (dynamic + selected, optimized + hovered)
 * compose without per-combination styles. A fixed row sets neither and gets
 * the kit's fallbacks.
 */
const BLUE_RGB = "59 130 246";
const PURPLE_RGB = "147 51 234";

export const rowPaletteVars: Record<
  "fixed" | "dynamic" | "optimized",
  React.CSSProperties | undefined
> = {
  fixed: undefined,
  dynamic: {
    "--adhoc-row-rgb": BLUE_RGB,
    "--adhoc-accent-rgb": BLUE_RGB,
  } as React.CSSProperties,
  optimized: {
    "--adhoc-row-rgb": PURPLE_RGB,
    "--adhoc-accent-rgb": PURPLE_RGB,
  } as React.CSSProperties,
};

/** A data cell's share of the row tint, lighter than gutter and strip. */
export const rowTintCellStyle = css({
  backgroundColor: "[rgb(var(--adhoc-row-rgb, 255 255 255) / 0.08)]",
});

/** The gutter's and the count strip's stronger share of the row tint. */
export const rowTintStrongStyle = css({
  backgroundColor: "[rgb(var(--adhoc-row-rgb, 255 255 255) / 0.16)!]",
});

export const columnHeaderStyle = css({
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  borderRight: "[1px solid {colors.neutral.a05}]",
  padding: "[0]",
  textAlign: "left",
  fontWeight: "medium",
  fontFamily: "mono",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  _last: { borderRight: "none" },
});

/**
 * The dependency highlight: marks the rows a focused expression reads, and
 * the cells that read a focused Variable or Parameter. A neutral slate
 * wash — quiet enough not to fight the blue/purple row tints or the red
 * error underline, still clearly a marker. A background image so it
 * composites over the row tints; the selection overlay still wins.
 */
export const dependencyHighlightStyle = css({
  backgroundImage:
    "[linear-gradient(rgba(100, 116, 139, 0.12), rgba(100, 116, 139, 0.12))]",
});

/**
 * A read-structure name cell (a parameter's or scenario parameter's name):
 * plain face, fading out under a mask when it overflows.
 */
export const staticNameCellStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  overflow: "hidden",
  whiteSpace: "nowrap",
  maskImage:
    "[linear-gradient(to right, black calc(100% - 14px), transparent)]",
});

/**
 * A read-structure type cell, matching the variables' type-select face:
 * plain capitalized text at the same width.
 */
export const staticTypeCellStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "xs",
  color: "neutral.s80",
  textTransform: "capitalize",
});

/**
 * Lightens a gutter cell one surface step. The Variables lists wear it so
 * their gutters read quieter than the token tables'.
 */
export const lightGutterCellStyle = css({
  backgroundColor: "[{colors.neutral.s05}!]",
});
