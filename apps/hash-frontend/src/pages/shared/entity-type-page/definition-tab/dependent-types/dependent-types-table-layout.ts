export const rowHeight = 40;

export const openColumnWidth = 40;

export const formatVersions = (firstVersion: number, lastVersion: number) =>
  firstVersion === lastVersion
    ? `v${firstVersion}`
    : `v${firstVersion}–v${lastVersion}`;

export const formatVersionList = (versions: number[]) =>
  versions.map((version) => `v${version}`).join(", ");

/** A cell, whose left padding is the gap between content-sized columns. */
export const cellSx = {
  pl: 3,
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
  gridArea: "1 / 2",
  pl: `${treeGutterWidth + 8}px`,
} as const;

/** A box that spans the table's grid and lays its children on the table's columns. */
export const subgridRowSx = {
  display: "grid",
  gridTemplateColumns: "subgrid",
  gridColumn: "1 / -1",
} as const;

/** The grid that holds a table's header and rows. */
export const tableGridClassName = "dependent-types-table-grid";
