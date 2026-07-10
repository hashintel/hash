import { createContext, useContext } from "react";

import type { TimeRange } from "./time-range";

export interface TimeRangeContextValue {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

/**
 * The active analysis window, lifted to context so the shell, pages, and the
 * step / vendor detail panels share one source of truth (synced to the `?range`
 * URL param) instead of prop-drilling `timeRange` / `onTimeRangeChange`.
 */
export const TimeRangeContext = createContext<TimeRangeContextValue | null>(
  null,
);

export function useTimeRange(): TimeRangeContextValue {
  const ctx = useContext(TimeRangeContext);
  if (!ctx) {
    throw new Error(
      "useTimeRange must be used within a TimeRangeContext provider",
    );
  }
  return ctx;
}
