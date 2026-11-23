import { describe, expect, it } from "vitest";

import { DEFAULT_METRIC_VIEW_SETTINGS } from "../../experiments/experiment-metric-timeline/view-state";
import { describeMetricView } from "./describe-metric-view";

describe("describeMetricView", () => {
  it.each([
    [{}, "distribution", "heatmap · value over time"],
    [{}, "scalar", "value over time"],
    [{ timeTrace: "maxToDate" }, "scalar", "maximum to date"],
    [
      { aggregateRuns: true, runAggregation: "median" },
      "distribution",
      "median over runs · value over time",
    ],
    [
      { aggregateRuns: true, runAggregation: "p90" },
      "distribution",
      "90th percentile over runs · value over time",
    ],
    [
      {
        distributionView: "bands",
        aggregateTime: true,
        timeAggregation: "sum",
      },
      "distribution",
      "percentile lines · sum over time",
    ],
  ] as const)("reads %j of a %s metric as %s", (settings, outputType, text) => {
    expect(
      describeMetricView(
        { ...DEFAULT_METRIC_VIEW_SETTINGS, ...settings },
        outputType,
      ),
    ).toBe(text);
  });
});
