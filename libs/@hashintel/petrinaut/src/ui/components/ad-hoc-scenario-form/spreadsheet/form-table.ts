/**
 * The shared spreadsheet grammar of the ad-hoc form, mirroring the token
 * spreadsheet (`ui/components/spreadsheet.tsx`): a bordered container, a
 * `border-collapse` table with 28px rows, hairline cell delimitations, a
 * gutter with a stronger right border, and a 2px blue focus outline on the
 * focused cell.
 */

import { css } from "@hashintel/ds-helpers/css";

export const CELL_HEIGHT = 28;

/**
 * The row palette, centralized. A row kind sets two custom properties on
 * its `<tr>` (via `rowPaletteVars`): `--adhoc-row-rgb`, the kind's tint,
 * and `--adhoc-accent-rgb`, the base every interactive shade derives from.
 * Every row state below is then a shade of one colour — the tint at
 * `/ 0.08` on data cells and `/ 0.16` on the gutter and count strip, the
 * row-selection overlay at `/ 0.14`, hover at `/ 0.08`, and the focused
 * cell's wash at `/ 0.10` — so combinations (dynamic + selected,
 * optimized + hovered) compose without per-combination styles. Plain rows
 * leave the variables unset and the `var()` fallbacks supply the neutral
 * gutter and the blue selection.
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

export const tableContainerStyle = css({
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
  overflowX: "auto",
  width: "[100%]",
  backgroundColor: "neutral.s00",
});

// The min width keeps a narrow container from crushing the flexible value
// columns to nothing (fixed layout shares the width): below it, the
// container scrolls horizontally instead.
export const tableStyle = css({
  width: "[100%]",
  minWidth: "[320px]",
  borderCollapse: "collapse",
  fontSize: "xs",
  tableLayout: "fixed",
});

export const gutterHeaderStyle = css({
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  borderRight: "[1px solid {colors.neutral.bd.subtle}]",
  padding: "[4px 8px]",
  textAlign: "center",
  fontWeight: "medium",
  width: "[40px]",
  minWidth: "[40px]",
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

export const gutterCellStyle = css({
  position: "relative",
  borderRight: "[1px solid {colors.neutral.bd.subtle}]",
  borderBottom: "[1px solid {colors.neutral.a05}]",
  padding: "[0]",
  textAlign: "center",
  // Near-white fallback: a plain row's gutter blends with the table (the
  // border still marks the column); only a tinted row colours it.
  backgroundColor: "[rgb(var(--adhoc-row-rgb, 252 252 252) / 0.14)]",
  height: "[28px]",
});

export const cellStyle = css({
  position: "relative",
  borderBottom: "[1px solid {colors.neutral.a05}]",
  borderRight: "[1px solid {colors.neutral.a05}]",
  padding: "[0]",
  height: "[28px]",
  _last: { borderRight: "none" },
});

/** The gutter's focusable button: opens the row's pop-up menu. */
export const gutterButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  background: "[transparent]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
  cursor: "pointer",
  _hover: {
    color: "neutral.s120",
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 100 116 139) / 0.10)]",
  },
  _focus: {
    outline: "[2px solid rgb(var(--adhoc-accent-rgb, 37 99 235))]",
    outlineOffset: "[-2px]",
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.10)]",
  },
});

/**
 * The gutter's three-dots affordance: appears on row hover or gutter focus
 * and opens the row's menu; the gutter button itself only selects.
 */
export const gutterMenuButtonStyle = css({
  position: "absolute",
  right: "[1px]",
  top: "[50%]",
  transform: "[translateY(-50%)]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[14px]",
  height: "[22px]",
  border: "none",
  borderRadius: "xs",
  background: "[transparent]",
  padding: "[0]",
  fontSize: "[11px]",
  lineHeight: "[1]",
  color: "neutral.s80",
  cursor: "pointer",
  opacity: "[0]",
  transition: "[opacity 0.12s ease]",
  "tr:hover &, tr:focus-within &": { opacity: "[0.7]" },
  _hover: { opacity: "[1!]", backgroundColor: "neutral.s20" },
});

/**
 * The shared look of a focusable cell button (value triggers, bound cells,
 * name cells): mono text, quiet hover wash, and the form's plain-:focus
 * selection ring — a pointer click selects the cell and the selection must
 * show either way. Height stays with the owner (cx cannot safely override
 * conflicting atomic properties).
 */
export const cellButtonStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  border: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: {
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 100 116 139) / 0.06)]",
  },
  _focus: {
    outline: "[2px solid rgb(var(--adhoc-accent-rgb, 37 99 235))]",
    outlineOffset: "[-2px]",
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.08)]",
  },
});

/** The wavy diagnostics underline on a cell's content (input or span). */
export const cellErrorUnderlineStyle = css({
  "& input, & span": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "red.s90",
    textUnderlineOffset: "[3px]",
  },
});

/** A borderless input filling a cell, spreadsheet-style. */
export const cellInputStyle = css({
  width: "[100%]",
  height: "[28px]",
  border: "none",
  outline: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  backgroundColor: "[transparent]",
  boxSizing: "border-box",
  _focus: {
    outline: "[2px solid rgb(var(--adhoc-accent-rgb, 37 99 235))]",
    outlineOffset: "[-2px]",
    backgroundColor: "[rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.10)]",
  },
});

/**
 * The row-selection highlight, applied to every cell of the row whose gutter
 * holds focus — the gutter included. A background image with `!`, so it
 * composites over row tints and wins over the shared-column wash; it shades
 * the row's own accent, so a selected dynamic row darkens blue and a
 * selected optimized row darkens purple.
 */
export const selectedRowCellStyle = css({
  backgroundImage:
    "[linear-gradient(rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.14), rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.14))!]",
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

/** The add-line's cells are a little shorter than content rows. */
export const phantomRowCellStyle = css({
  height: "[22px!]",
});

/**
 * A phantom cell: an empty trailing row's click target, quieter than real
 * content. A first click selects it; a click on the selected cell, or
 * Enter, materializes a fresh entry.
 */
export const phantomCellButtonStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[22px]",
  border: "none",
  background: "[transparent]",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s60",
  opacity: "[0.55]",
  cursor: "text",
  transition: "[opacity 0.12s ease, color 0.12s ease]",
  "tr:hover &, tr:focus-within &": { opacity: "[1]", color: "neutral.s90" },
  _hover: { backgroundColor: "neutral.s10" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
    color: "neutral.s90",
    opacity: "[1]",
  },
});

/** The quiet "+" button filling an add-line's gutter; hovering or focusing
 * anywhere on the row darkens it to the real gutter buttons' hover
 * treatment, and clicking it creates the new entry too. */
export const phantomGutterButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[100%]",
  height: "[100%]",
  border: "none",
  background: "[transparent]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "[11px]",
  color: "neutral.s60",
  opacity: "[0.55]",
  cursor: "pointer",
  transition: "[opacity 0.12s ease, color 0.12s ease]",
  "tr:hover &, tr:focus-within &": {
    opacity: "[1]",
    color: "neutral.s120",
    fontWeight: "semibold",
  },
  _hover: {
    color: "neutral.s120",
    backgroundColor: "neutral.s10",
  },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
    color: "neutral.s120",
    opacity: "[1]",
  },
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

/**
 * Renders a cell's Select as a square spreadsheet cell rather than a
 * control. Applied to the owning `<td>` — the Select drops `className` — and
 * the visible box is an unnamed div under `[data-part='root']` styled by
 * base-input variables, so the neutralization hits every div beneath the
 * root; the dropdown itself is portalled out and keeps its own look.
 */
export const cellSelectStyle = css({
  "& [data-part='root']": {
    width: "[100%!]",
    minWidth: "[100%!]",
    height: "[28px!]",
    minHeight: "[0!]",
    "--base-input-border-radius": "0px",
    "--base-input-background-color": "transparent",
    _hover: {
      backgroundColor: "[rgb(var(--adhoc-accent-rgb, 100 116 139) / 0.10)]",
    },
    _focusWithin: {
      outline: "[2px solid rgb(var(--adhoc-accent-rgb, 37 99 235))]",
      outlineOffset: "[-2px]",
      backgroundColor: "[rgb(var(--adhoc-accent-rgb, 37 99 235) / 0.10)]",
    },
  },
  "& [data-part='root'] div": {
    height: "[28px!]",
    minHeight: "[0!]",
    borderRadius: "[0!]",
    borderColor: "[transparent!]",
    boxShadow: "[none!]",
    backgroundColor: "[transparent!]",
  },
  // The trigger fills its cell so every select is the same width and the
  // chevron sits at the same x; plain (non-code) face, quiet indicator.
  "& [data-part='trigger']": {
    width: "[100%!]",
    justifyContent: "space-between",
    fontSize: "xs",
    height: "[28px!]",
    minHeight: "[0!]",
    paddingY: "[0!]",
  },
  "& [data-part='indicator']": {
    color: "neutral.s60",
  },
  "& [data-part='indicator'] svg": {
    width: "[11px]",
    height: "[11px]",
  },
});
