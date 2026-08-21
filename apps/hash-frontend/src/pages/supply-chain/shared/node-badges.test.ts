import { describe, expect, it } from "vitest";

import { makeNode, obs } from "./observation-fixtures";
import { applyOutlierSelectionToNode } from "./outlier-selection";
import { windowGraphNodeToRange } from "./range-filter";

import type { NodeYieldSeries, NodeConsumptionSeries } from "./types";

const yieldSeries: NodeYieldSeries = {
  reference: 95,
  observations: [
    obs("2026-01", 90),
    obs("2026-02", 92),
    obs("2026-03", 95),
    obs("2026-04", 93),
  ],
};

const consumptionSeries: NodeConsumptionSeries = {
  n_components: 2,
  observations: [
    { ...obs("2026-01", 4), actual_qty: 104, expected_qty: 100 },
    { ...obs("2026-02", 6), actual_qty: 106, expected_qty: 100 },
    { ...obs("2026-03", 2), actual_qty: 102, expected_qty: 100 },
  ],
};

describe("node R:/C: badge recompute from shipped series", () => {
  it("recomputes yield_summary from the windowed series", () => {
    const node = makeNode({ type: "production", yield_series: yieldSeries });
    const windowed = windowGraphNodeToRange(node, "12m");
    expect(windowed.yield_summary?.median).toBeCloseTo(92.5, 6);
    expect(windowed.yield_summary?.reference).toBe(95);
    expect(windowed.yield_summary?.n).toBe(4);
  });

  it("recomputes consumption_summary (incl. weighted variance) from the windowed series", () => {
    const node = makeNode({
      type: "production",
      consumption_series: consumptionSeries,
    });
    const windowed = windowGraphNodeToRange(node, "12m");
    expect(windowed.consumption_summary?.median_variance).toBeCloseTo(4, 6);
    expect(windowed.consumption_summary?.n_components).toBe(2);
    // weighted = (sum actual - sum expected)/sum expected = (312-300)/300 = 4%
    expect(windowed.consumption_summary?.weighted_variance).toBeCloseTo(4, 6);
  });

  it("leaves the shipped summary untouched when no series is present", () => {
    const node = makeNode({
      type: "production",
      yield_summary: { median: 88, mean: 88, reference: 95, n: 3 },
    });
    const windowed = windowGraphNodeToRange(node, "12m");
    expect(windowed.yield_summary?.median).toBe(88);
  });

  it("does not apply the timing mean rule to yield observations", () => {
    const withOutlier: NodeYieldSeries = {
      reference: 95,
      observations: [...yieldSeries.observations, obs("2026-05", 5)],
    };
    const node = makeNode({ type: "production", yield_series: withOutlier });
    const selected = applyOutlierSelectionToNode(node, true);
    // Yield remains raw: the setting applies only to timing means.
    expect(
      selected.yield_series?.observations.some(
        (observation) => observation.value === 5,
      ),
    ).toBe(true);
    const windowed = windowGraphNodeToRange(selected, "12m");
    expect(windowed.yield_summary?.n).toBe(5);
  });
});
