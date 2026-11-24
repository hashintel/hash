/**
 * The shared spreadsheet grammar of the editor's form tables, mirroring the
 * token spreadsheet (`spreadsheet.tsx`): a bordered container, a
 * `border-collapse` table with 28px rows, hairline cell delimitations, a
 * gutter with a stronger right border, and a 2px blue focus outline on the
 * focused cell.
 */

import { css } from "@hashintel/ds-helpers/css";

/**
 * Row colour. The styles below read two custom properties from the row's
 * `<tr>`: `--adhoc-row-rgb`, the tint of its gutter, and
 * `--adhoc-accent-rgb`, the base of every interactive shade (hover, the
 * focus outline and its wash, the row-selection overlay). A table that
 * colours its rows sets the two on each `<tr>`, so a coloured row that is
 * also hovered or selected needs no style of its own. A row that sets
 * neither gets the `var()` fallbacks: the neutral gutter and the blue
 * selection.
 */

export const tableContainerStyle = css({
  userSelect: "none",
  "& :is(input, textarea, [contenteditable=true])": { userSelect: "text" },
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a45",
  borderRadius: "md",
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
 * Fits the Select and its chevron inside the spreadsheet cell. The visible
 * box is the root's direct div, whose ::after draws the chevron; the
 * dropdown is portalled out and keeps its own styles.
 */
export const cellSelectStyle = css({
  "& [data-part='root']": {
    width: "[100%!]",
    minWidth: "[0!]",
    height: "[28px!]",
    minHeight: "[0!]",
    "--form-min-width": "0px",
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
  "& [data-part='root'] > div": {
    width: "[100%!]",
    _after: {
      width: "[5px]",
      height: "[5px]",
      marginLeft: "[6px]",
      marginRight: "[8px]",
      color: "neutral.s60",
    },
  },
  "& [data-part='trigger']": {
    width: "[100%!]",
    fontSize: "xs",
    height: "[28px!]",
    minHeight: "[0!]",
    paddingY: "[0!]",
  },
});

/**
 * A gutter button that also starts a row drag: the row's glyph gives way
 * to a grip while the row is hovered or focused, and the cursor says the
 * row can be picked up.
 */
export const dragHandleButtonStyle = css({
  cursor: "grab",
  "& [data-grip]": { display: "none" },
  "&:is(tr:hover *, tr:focus-within *) [data-glyph]": { display: "none" },
  "&:is(tr:hover *, tr:focus-within *) [data-grip]": { display: "flex" },
  "&[data-dragging]": { cursor: "grabbing" },
});

/**
 * A column header that is a label ("Name", "Tokens") rather than an
 * identifier: small caps on the header band, quiet next to the cells.
 */
export const labelHeaderStyle = css({
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  borderRight: "[1px solid {colors.neutral.a05}]",
  height: "[24px]",
  paddingX: "2",
  textAlign: "left",
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.4px]",
  textTransform: "uppercase",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  _last: { borderRight: "none" },
});
