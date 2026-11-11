import type { SxProps, Theme } from "@mui/material";

export const rowHeight = 40;

export const openColumnWidth = 40;

export const formatVersions = (firstVersion: number, lastVersion: number) =>
  firstVersion === lastVersion
    ? `v${firstVersion}`
    : `v${firstVersion}–v${lastVersion}`;

export const formatVersionList = (versions: number[]) =>
  versions.map((version) => `v${version}`).join(", ");

export const cellSx = {
  pl: 3.5,
  pr: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

/** A first column's cell, which needs no room for the chevron, since the chevron and the tree lines start the second column. */
export const firstCellSx = { ...cellSx, pl: 1 } as const;

/** The width of the gutter at the start of the second column, which holds the chevron and the tree lines. */
export const treeGutterWidth = 24;

/** Where the chevron and the tree's vertical line are centred, from the start of the column. */
export const treeLineOffset = 12;

/** A second column's cell, whose text starts a spacing step after the tree gutter, so that the elbow stops short of it. */
export const treeCellSx = {
  ...cellSx,
  pl: `${treeGutterWidth + 8}px`,
} as const;

/** Hides text on screen while screen readers still read it. */
export const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  m: "-1px",
  p: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export const rowToggleClassName = "dependent-type-row-toggle";

/** The box around an expandable row, which highlights the row's toggle while any part of the row is hovered. */
export const toggleRowSx: SxProps<Theme> = ({ palette }) => ({
  position: "relative",
  height: rowHeight,
  [`&:hover .${rowToggleClassName}`]: { background: palette.gray[10] },
});
