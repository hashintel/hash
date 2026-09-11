import { css } from "@hashintel/ds-helpers/css";

/** Shared Panda styles for the site-screen tables (dwell / planning / supplier). */
// Caps the active detail table to the viewport *after* accounting for the site
// header/content padding and the tab bar above this container (`h:11` = 2.75rem).
// The table then scrolls internally as a plain block (matching the Opportunities
// `tableScroll`) so the sticky `th` border travels with the header.
export const TABLE_MAX_HEIGHT = "calc(100dvh - 9.75rem - 100px)";
export const tableContainer = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
  overflow: "auto",
});
// Card variant hosting a pinned filter band above the scrolling table,
// matching the Opportunities card: the band keeps the card's white background
// and the table scrolls beneath it in its own pane.
export const tableCard = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
  overflow: "hidden",
});
// Padding lives on the rows, not this container, for two reasons: the filter
// row's top border must reach the card edges, and the tab row's own height
// (top padding included via `tabButtons`) is what the filter/sort controls
// centre against — container padding would visually unbalance them.
export const filterHeader = css({
  flexShrink: "0",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  flexDirection: "column",
});
/**
 * Leading tab cluster left, filter/sort controls right, centre-aligned. The
 * tab cluster opts out via `alignSelf: stretch` (see `tabButtons`) so its
 * underline still anchors to the border beneath the row.
 */
export const filterHeaderRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  px: "4",
});
export const filterHeaderActions = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
});
/** Active-filter row: a full-width top border keeps a rule under the tabs. */
export const filterChipsRow = css({
  px: "4",
  py: "3",
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
});
export const tableScroll = css({ flex: "1", minH: "0", overflow: "auto" });
export const table = css({ w: "full", textStyle: "sm", lineHeight: "normal" });
export const theadRow = css({
  textAlign: "left",
  color: "fg.subtle",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  bg: "[#fafafa]",
});
// Sticky header cells: opaque bg (so scrolled rows don't bleed through) + z above
// body. `top:0` parks them at the top of this container's own scroll area; the
// bottom border matches the Opportunities header (#d9d9d9) and travels with the
// sticky cell.
export const th = css({
  position: "sticky",
  top: "0",
  zIndex: "[1]",
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});
export const thRight = css({
  position: "sticky",
  top: "0",
  zIndex: "[1]",
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  textAlign: "right",
  whiteSpace: "nowrap",
});
export const tbodyDivide = css({
  "& > tr": { borderTopWidth: "1px", borderColor: "[#f0f0f0]" },
  "& > tr:first-child": { borderTopWidth: "0" },
});
export const bodyRow = css({
  cursor: "pointer",
  transition: "colors",
  _hover: { bg: "bg.subtle" },
});
export const td = css({ px: "4", py: "2.5", verticalAlign: "top" });
export const tdRight = css({
  px: "4",
  py: "2.5",
  textAlign: "right",
  verticalAlign: "top",
  fontVariantNumeric: "tabular-nums",
});
export const cellFlex = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
});
export const stepMarker = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  flexShrink: 0,
  gap: "1",
});
export const catDot = css({
  w: "2",
  h: "2",
  borderRadius: "full",
  flexShrink: 0,
});
/** Centres an 8px category dot within the first 20px text line. */
export const stepDot = css({ mt: "1.5" });
export const stepLabel = css({ fontWeight: "medium", color: "fg.heading" });
export const valueStrong = css({ color: "fg.heading" });
export const policyQuantity = css({ whiteSpace: "nowrap" });
export const valueMuted = css({ color: "fg.subtle" });
export const valueDim = css({ color: "fg.muted" });
export const numMedium = css({ fontWeight: "medium" });
export const valueDanger = css({
  fontWeight: "medium",
  color: "status.error.fg.body",
});
export const trendDanger = css({
  fontWeight: "medium",
  color: "status.error.fg.body",
});
export const trendSuccess = css({
  fontWeight: "medium",
  color: "status.success.fg.body",
});
export const sampleCell = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1.5",
});
export const badgeWrap = css({
  display: "inline-flex",
  alignItems: "center",
  verticalAlign: "middle",
});
// Value with a small trend chip stacked beneath it (dwell measure + cost cells).
export const stackedCell = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "0.5",
});
export const stackedTrend = css({ textStyle: "xs" });
// Stacked Brief + Status actions in the right-most table cell.
export const briefActionStack = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "1.5",
});
export const emptyCell = css({
  px: "4",
  py: "6",
  textAlign: "center",
  color: "fg.subtle",
  fontStyle: "italic",
});
