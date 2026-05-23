import {
  buildMetricState,
  type CompiledMetric,
  type Color,
  type Metric,
  type Place,
} from "@hashintel/petrinaut-core";

import { DEFAULT_COLORS } from "../default-colors";

import type { TimelineSeriesConfig } from "../types";

/**
 * Builds the timeline series for a user-authored metric.
 *
 * Metric views expose one plotted series and evaluate the compiled metric
 * against each incoming frame. Runtime metric errors become NaN so uPlot draws
 * a gap instead of crashing the timeline.
 */
export function buildMetricSeriesConfig(args: {
  metric: Metric | null;
  compiledMetric: CompiledMetric | null;
  places: Place[];
  types: Color[];
}): TimelineSeriesConfig {
  const { metric, compiledMetric, places, types } = args;

  if (!metric || !compiledMetric) {
    return {
      series: [],
      extract: () => Number.NaN,
    };
  }

  return {
    series: [
      {
        seriesId: metric.id,
        seriesName: metric.name,
        color: DEFAULT_COLORS[0]!,
      },
    ],
    extract: (frame) => {
      try {
        return compiledMetric(buildMetricState(frame, places, types));
      } catch {
        return Number.NaN;
      }
    },
  };
}
