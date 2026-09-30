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
  {
    name: `Observed days (${display.measureLabel})`,
    sortKey: "median",
    sortIcon: "numeric",
  },
  { name: "Days trend %", sortKey: "trend", sortIcon: "numeric" },
  { name: "MOQ", sortKey: "moq", sortIcon: "numeric" },
  { name: "Safety stock", sortKey: "safetyStock", sortIcon: "numeric" },
  {
    name: `Carrying cost${periodSuffix(display)}`,
    sortKey: "cost",
    sortIcon: "numeric",
  },
  { name: "Cost trend %", sortKey: "costTrend", sortIcon: "numeric" },
  { name: "Samples", sortKey: "sample", sortIcon: "numeric" },
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
    sortIcon: "numeric",
  },
  { name: "Planned days", sortKey: "planned", sortIcon: "numeric" },
  {
    name: `Observed days (${display.measureLabel})`,
    sortKey: "median",
    sortIcon: "numeric",
  },
  { name: "Deviation %", sortKey: "deviation", sortIcon: "numeric" },
  { name: "Trend %", sortKey: "trend", sortIcon: "numeric" },
  { name: "% exceeding plan", sortKey: "exceeding", sortIcon: "numeric" },
  { name: "Status", sortKey: "status" },
];

export const trendSorters = ({
  measureLabel,
}: Pick<SorterDisplay, "measureLabel">): ReadonlyArray<Sorter<SortKey>> => [
  { name: "Step name", sortKey: "material" },
  {
    name: `Current days (${measureLabel})`,
    sortKey: "median",
    sortIcon: "numeric",
  },
  {
    name: `Previous days (${measureLabel})`,
    sortKey: "previous",
    sortIcon: "numeric",
  },
  { name: "Trend %", sortKey: "trend", sortIcon: "numeric" },
  { name: "Samples", sortKey: "sample", sortIcon: "numeric" },
  { name: "Status", sortKey: "status" },
];

export const OPPORTUNITY_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  // Sorts `opportunity.title`, the underlying step's display name.
  { name: "Step name", sortKey: "opportunity" },
  { name: "Impact", sortKey: "impact", sortIcon: "numeric" },
  { name: "Sample", sortKey: "sampleSize", sortIcon: "numeric" },
  { name: "Status", sortKey: "status" },
];

export const SUPPLIER_SORTERS: ReadonlyArray<Sorter<SortKey>> = [
  { name: "Vendor", sortKey: "vendor" },
  { name: "Materials count", sortKey: "materialsCount", sortIcon: "numeric" },
  { name: "Lines", sortKey: "lines", sortIcon: "numeric" },
  { name: "Late lines", sortKey: "nLate", sortIcon: "numeric" },
  { name: "On-time %", sortKey: "onTime", sortIcon: "numeric" },
  { name: "OTIF %", sortKey: "otif", sortIcon: "numeric" },
  { name: "Mean delay (all)", sortKey: "meanLate", sortIcon: "numeric" },
  {
    name: "Mean delay when late",
    sortKey: "meanLateWhenLate",
    sortIcon: "numeric",
  },
  { name: "Max delay", sortKey: "maxLate", sortIcon: "numeric" },
];
