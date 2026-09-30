import type { SortDir, SortKey } from "./row-types";
import type { SortDirection, Sorter } from "@hashintel/ds-components";

/**
 * Sorter lists for each site table's SortMenu, ordered and named to mirror
 * the table's filter menu (see `STEP_FILTER_MENUS`): column sorts in
 * column order plus the few surviving menu-only metrics (change, the
 * opportunities' sample count). The menu and the column headers drive the
 * same `{key, dir}` sort state, so either control reflects the other; a
 * menu-only sort simply shows no active column caret.
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

/**
 * Display context for sorter names. Only qualifiers that change the resulting
 * order belong here: the measure (median vs P95 sort differently) and the
 * analysis window. Plain units (currency, days) are omitted — the order is
 * the same regardless of unit.
 */
export interface SorterDisplay {
  /** Active measure label, e.g. "Median". */
  measureLabel: string;
  timeRange: string;
}

/** "(12m)" suffix for period-scoped metrics. */
const periodSuffix = ({ timeRange }: SorterDisplay): string =>
  ` (${timeRange})`;

export const dwellSorters = (
  display: SorterDisplay,
): ReadonlyArray<Sorter<SortKey>> => [
  { name: "Step name", sortKey: "material" },
  { name: `Observed days (${display.measureLabel})`, sortKey: "median" },
  { name: "Days trend %", sortKey: "trend" },
  { name: "MOQ", sortKey: "moq" },
  { name: "Safety stock", sortKey: "safetyStock" },
  { name: `Carrying cost${periodSuffix(display)}`, sortKey: "cost" },
  { name: "Cost trend %", sortKey: "costTrend" },
  { name: "Samples", sortKey: "sample" },
  { name: "Status", sortKey: "status" },
];

export const planningSorters = (
  display: SorterDisplay,
): ReadonlyArray<Sorter<SortKey>> => [
  { name: "Step name", sortKey: "material" },
  { name: "Supplier", sortKey: "supplier" },
  { name: "Basis", sortKey: "basis" },
  {
    name: `Material value${periodSuffix(display)}`,
    sortKey: "materialValue",
  },
  { name: "Planned days", sortKey: "planned" },
  { name: `Observed days (${display.measureLabel})`, sortKey: "median" },
  { name: "Deviation %", sortKey: "deviation" },
  { name: "Trend %", sortKey: "trend" },
  { name: "% exceeding plan", sortKey: "exceeding" },
  { name: "Status", sortKey: "status" },
];

export const trendSorters = ({
  measureLabel,
}: Pick<SorterDisplay, "measureLabel">): ReadonlyArray<Sorter<SortKey>> => [
  { name: "Step name", sortKey: "material" },
  { name: `Current days (${measureLabel})`, sortKey: "median" },
  { name: `Previous days (${measureLabel})`, sortKey: "previous" },
  { name: "Trend %", sortKey: "trend" },
  { name: "Samples", sortKey: "sample" },
  { name: "Status", sortKey: "status" },
];

export const OPPORTUNITY_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  // Sorts `opportunity.title`, the underlying step's display name.
  { name: "Step name", sortKey: "opportunity" },
  { name: "Impact", sortKey: "impact" },
  { name: "Sample", sortKey: "sampleSize" },
  { name: "Status", sortKey: "status" },
];

export const SUPPLIER_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Vendor", sortKey: "vendor" },
  { name: "Materials count", sortKey: "materialsCount" },
  { name: "Lines", sortKey: "lines" },
  { name: "Late lines", sortKey: "nLate" },
  { name: "On-time %", sortKey: "onTime" },
  { name: "OTIF %", sortKey: "otif" },
  { name: "Mean delay (all)", sortKey: "meanLate" },
  { name: "Mean delay when late", sortKey: "meanLateWhenLate" },
  { name: "Max delay", sortKey: "maxLate" },
];
