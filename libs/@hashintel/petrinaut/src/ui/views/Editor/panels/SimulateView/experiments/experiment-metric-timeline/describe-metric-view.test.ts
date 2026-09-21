import { describe, expect, it } from "vitest";

import { describeMetricView } from "./describe-metric-view";
import { DEFAULT_METRIC_VIEW_SETTINGS } from "./view-state";

describe("describeMetricView", () => {
  it("reads the defaults as a heatmap of values over time", () => {
    expect(
      describeMetricView(DEFAULT_METRIC_VIEW_SETTINGS, "distribution"),
    ).toBe("heatmap · value over time");
  });

  it("names only the time part for a scalar metric", () => {
    expect(describeMetricView(DEFAULT_METRIC_VIEW_SETTINGS, "scalar")).toBe(
      "value over time",
    );
    expect(
      describeMetricView(
        { ...DEFAULT_METRIC_VIEW_SETTINGS, timeTrace: "maxToDate" },
        "scalar",
      ),
    ).toBe("maximum to date");
  });

  it("names the run aggregation when runs collapse", () => {
    expect(
      describeMetricView(
        {
          ...DEFAULT_METRIC_VIEW_SETTINGS,
          aggregateRuns: true,
          runAggregation: "median",
        },
        "distribution",
      ),
    ).toBe("median over runs · value over time");
    expect(
      describeMetricView(
        {
          ...DEFAULT_METRIC_VIEW_SETTINGS,
          aggregateRuns: true,
          runAggregation: "p90",
        },
        "distribution",
      ),
    ).toBe("90th percentile over runs · value over time");
  });

  it("names the time aggregation when the series collapses", () => {
    expect(
      describeMetricView(
        {
          ...DEFAULT_METRIC_VIEW_SETTINGS,
          distributionView: "bands",
          aggregateTime: true,
          timeAggregation: "sum",
        },
        "distribution",
      ),
    ).toBe("percentile lines · sum over time");
  });
});
