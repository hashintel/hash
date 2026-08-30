/**
 * The shared spreadsheet grammar of the ad-hoc form, mirroring the token
 * spreadsheet (`ui/components/spreadsheet.tsx`): a bordered container, a
 * `border-collapse` table with 28px rows, hairline cell delimitations, a
 * gutter with a stronger right border, and a 2px blue focus outline on the
 * focused cell.
 */

import { css } from "@hashintel/ds-helpers/css";

export const CELL_HEIGHT = 28;

export const tableContainerStyle = css({
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
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
  backgroundColor: "neutral.s10",
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
  _hover: { color: "neutral.s120", backgroundColor: "neutral.s20" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
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
  _hover: { backgroundColor: "neutral.s10" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
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
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

/**
 * The row-selection highlight, applied to every cell of the row whose gutter
 * holds focus. A background image with `!`, so it composites over row tints
 * and wins over the shared-column wash; strong enough to read as clearly
 * darker over the dynamic and optimized tints, which share its hue family.
 */
export const selectedRowCellStyle = css({
  backgroundImage:
    "[linear-gradient(rgba(37, 99, 235, 0.18), rgba(37, 99, 235, 0.18))!]",
});

/**
 * The dependency highlight: marks the rows a focused expression reads, and
 * the cells that read a focused Variable or Parameter. Amber, so it reads
 * as a marker and never collides with the blue/purple row tints or the red
 * error underline. A background image so it composites over the row tints;
 * the selection overlay still wins.
 */
export const dependencyHighlightStyle = css({
  backgroundImage:
    "[linear-gradient(rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0.16))]",
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
    backgroundColor: "neutral.s20",
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
 * Lightens a gutter cell one surface step. The Variables list wears it so
 * the whole block reads lighter than the raised token table beneath it.
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
    _hover: { backgroundColor: "neutral.s10" },
    _focusWithin: {
      outline: "[2px solid {colors.blue.s70}]",
      outlineOffset: "[-2px]",
      backgroundColor: "blue.s05",
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
  "& [data-part='trigger']": {
    fontFamily: "mono",
    fontSize: "xs",
    height: "[28px!]",
    minHeight: "[0!]",
    paddingY: "[0!]",
  },
});
