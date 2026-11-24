import { DEFAULT_COLORS } from "../default-colors";

import type { SimulationFrameReader } from "../../../../../../../../../react/simulation/context";
import type { TimelineSeriesConfig } from "../types";
import type { Metric } from "@hashintel/petrinaut-core";

/** Evaluates the selected metric against one timeline frame. */
export type TimelineMetricEvaluator = (frame: SimulationFrameReader) => number;

/**
 * Builds the timeline series for a user-authored metric.
 *
 * Metric views expose one plotted series and evaluate the HIR-compiled
 * metric against each incoming frame. Runtime metric errors become NaN so
 * uPlot draws a gap instead of crashing the timeline.
 */
export function buildMetricSeriesConfig(args: {
  metric: Metric | null;
  evaluateMetric: TimelineMetricEvaluator | null;
}): TimelineSeriesConfig {
  const { metric, evaluateMetric } = args;

  if (!metric || !evaluateMetric) {
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
        return evaluateMetric(frame);
      } catch {
        return Number.NaN;
      }
    },
  };
}
