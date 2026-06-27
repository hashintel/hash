/** Canonical analysis window. Single source of truth across the app. */
export type TimeRange = "3m" | "6m" | "12m";

/**
 * Options for the range `SegmentedControl`. One definition, used by every
 * view (product / site / step-detail) so the control is consistent.
 */
export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "3m", label: "3m" },
  { value: "6m", label: "6m" },
  { value: "12m", label: "12m" },
];

/** Number of months represented by each `TimeRange`. */
export function rangeMonths(range: TimeRange): number {
  if (range === "3m") {
    return 3;
  }
  if (range === "6m") {
    return 6;
  }
  return 12;
}

/** Long-form window label, e.g. "Last 6 months". */
export function timeRangeLongLabel(range: TimeRange): string {
  return `Last ${rangeMonths(range)} months`;
}

/** `YYYY-MM` for the calendar month a fixed number of months before the current month. */
export function monthKeyMonthsAgo(monthsBack: number): string {
  const now = new Date();
  const month = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1),
  );
  return month.toISOString().slice(0, 7);
}

/** `YYYY-MM` inclusive lower bound for exactly `rangeMonths(range)` calendar buckets. */
export function cutoffForRange(range: TimeRange): string {
  return monthKeyMonthsAgo(rangeMonths(range) - 1);
}
