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

export const tableStyle = css({
  width: "[100%]",
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

export const actionCellStyle = css({
  borderBottom: "[1px solid {colors.neutral.a05}]",
  padding: "[0]",
  textAlign: "center",
  width: "[32px]",
  minWidth: "[32px]",
  height: "[28px]",
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
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
});

/**
 * A Select rendered as a square spreadsheet cell rather than a control: the
 * visible box lives on `[data-part='select']`, whose border, radius, and
 * background come from base-input variables, so those are neutralized here.
 */
export const cellSelectStyle = css({
  width: "[100%]",
  display: "block",
  "& [data-part='select']": {
    width: "[100%!]",
    minWidth: "[100%!]",
    minHeight: "[28px]",
    borderRadius: "[0!]",
    borderColor: "[transparent!]",
    boxShadow: "[none!]",
    backgroundColor: "[transparent!]",
    "--base-input-border-radius": "0px",
    "--base-input-background-color": "transparent",
    _hover: { backgroundColor: "[{colors.neutral.s10}!]" },
    _focusWithin: {
      outline: "[2px solid {colors.blue.s50}]",
      outlineOffset: "[-2px]",
    },
  },
  "& [data-part='trigger']": {
    fontFamily: "mono",
    fontSize: "xs",
  },
});

/**
 * A row's delete control: a quiet trashcan that appears when the row is
 * hovered or holds focus, and commits to full opacity only under the pointer.
 */
export const rowDeleteButtonStyle = css({
  opacity: "[0]",
  transition: "[opacity 0.12s ease]",
  "tr:hover &, tr:focus-within &": {
    opacity: "[0.5]",
  },
  _hover: { opacity: "[1!]" },
  _focusVisible: { opacity: "[1!]" },
});

export const footerRowStyle = css({
  padding: "[4px 8px]",
  textAlign: "right",
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
  backgroundColor: "neutral.s10",
});
