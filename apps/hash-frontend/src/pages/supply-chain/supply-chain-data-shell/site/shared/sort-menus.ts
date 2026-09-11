import type { SortDir, SortKey } from "./row-types";
import type { SortDirection, Sorter } from "@hashintel/ds-components";

/**
 * Sorter lists for each site table's SortMenu, including every column sort
 * plus menu-only derived metrics (tail ratio, variability, change, supplier
 * reliability breakdowns) that have no column of their own. The menu and the
 * column headers drive the same `{key, dir}` sort state, so either control
 * reflects the other; a menu-only sort simply shows no active column caret.
 */

export const sortMenuValueOf = (
  sort: { key: SortKey; dir: SortDir } | null,
): { sortKey: SortKey; direction: SortDirection } | undefined =>
  sort
    ? {
        sortKey: sort.key,
        direction: sort.dir === "asc" ? "ASCENDING" : "DESCENDING",
      }
    : undefined;

export const sortFromMenu = (
  sortKey: SortKey,
  direction: SortDirection,
): { key: SortKey; dir: SortDir } => ({
  key: sortKey,
  dir: direction === "ASCENDING" ? "asc" : "desc",
});

export const DWELL_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Step name", sortKey: "material" },
  { name: "Observed days", sortKey: "median" },
  { name: "Carrying cost", sortKey: "cost" },
  { name: "Cost trend", sortKey: "costTrend" },
  { name: "Timing trend", sortKey: "trend" },
  { name: "Change (days)", sortKey: "changeDays" },
  { name: "Previous value", sortKey: "previous" },
  { name: "MOQ", sortKey: "moq" },
  { name: "Safety stock", sortKey: "safetyStock" },
  { name: "Tail ratio (P95 ÷ median)", sortKey: "tailRatio" },
  { name: "Variability (CV)", sortKey: "variability" },
  { name: "Samples", sortKey: "sample" },
  { name: "Status", sortKey: "status" },
];

export const PLANNING_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Step name", sortKey: "material" },
  { name: "Supplier", sortKey: "supplier" },
  { name: "Basis", sortKey: "basis" },
  { name: "Material value", sortKey: "materialValue" },
  { name: "Planned days", sortKey: "planned" },
  { name: "Observed days", sortKey: "median" },
  { name: "Deviation %", sortKey: "deviation" },
  { name: "% exceeding plan", sortKey: "exceeding" },
  { name: "Buffer releasable (days)", sortKey: "bufferReleasable" },
  { name: "Trend", sortKey: "trend" },
  { name: "Change (days)", sortKey: "changeDays" },
  { name: "Previous value", sortKey: "previous" },
  { name: "Tail ratio (P95 ÷ median)", sortKey: "tailRatio" },
  { name: "Variability (CV)", sortKey: "variability" },
  { name: "Samples", sortKey: "sample" },
  { name: "Status", sortKey: "status" },
];

export const TREND_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Step name", sortKey: "material" },
  { name: "Current value", sortKey: "median" },
  { name: "Previous value", sortKey: "previous" },
  { name: "Change (days)", sortKey: "changeDays" },
  { name: "Trend %", sortKey: "trend" },
  { name: "Tail ratio (P95 ÷ median)", sortKey: "tailRatio" },
  { name: "Variability (CV)", sortKey: "variability" },
  { name: "Samples", sortKey: "sample" },
  { name: "Status", sortKey: "status" },
];

export const OPPORTUNITY_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Impact", sortKey: "impact" },
  { name: "Title", sortKey: "opportunity" },
  { name: "Step type", sortKey: "stepType" },
  { name: "Sample size", sortKey: "sampleSize" },
  { name: "Status", sortKey: "status" },
];

export const SUPPLIER_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Vendor", sortKey: "vendor" },
  { name: "OTIF %", sortKey: "otif" },
  { name: "On-time %", sortKey: "onTime" },
  { name: "In-full gap", sortKey: "inFullGap" },
  { name: "PO lines", sortKey: "lines" },
  { name: "Late lines", sortKey: "nLate" },
  { name: "Late share", sortKey: "lateShare" },
  { name: "Severe late (≥7d)", sortKey: "severeLate" },
  { name: "Mean delay (all)", sortKey: "meanLate" },
  { name: "Mean delay when late", sortKey: "meanLateWhenLate" },
  { name: "Max delay", sortKey: "maxLate" },
  { name: "Materials supplied", sortKey: "materialsCount" },
];
