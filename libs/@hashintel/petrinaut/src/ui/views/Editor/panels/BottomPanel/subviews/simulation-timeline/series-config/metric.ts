import { type Metric } from "@hashintel/petrinaut-core";

import { DEFAULT_COLORS } from "../default-colors";

import type { TimelineSeriesConfig } from "../types";

/**
 * Builds the timeline series for a user-authored metric.
 *
 * Metric views expose one plotted series whose values are produced
 * via the {@link MetricEvaluator} owned by the EvalSandbox. The
 * `extract` here is only called for non-metric series in the streaming
 * loop — the metric column is supplied directly by
 * `use-streaming-data.ts` after a `evaluator.evaluateBatch(...)` call.
 */
export function buildMetricSeriesConfig(args: {
  metric: Metric | null;
  metricReady: boolean;
}): TimelineSeriesConfig {
  const { metric, metricReady } = args;

  if (!metric || !metricReady) {
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
    // Not used in metric mode — `use-streaming-data.ts` short-circuits
    // to the precomputed column. Defined for type completeness.
    extract: () => Number.NaN,
  };
}
