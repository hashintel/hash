export const rowHeight = 40;

/** The width of the open button at the end of each row. */
export const openColumnWidth = 40;

export const formatVersions = (firstVersion: number, lastVersion: number) =>
  firstVersion === lastVersion
    ? `v${firstVersion}`
    : `v${firstVersion}–v${lastVersion}`;

export const formatVersionList = (versions: number[]) =>
  versions.map((version) => `v${version}`).join(", ");

/** A cell's padding leaves room on the left for the chevron and the tree lines. */
export const cellSx = {
  pl: 3.5,
  pr: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;
