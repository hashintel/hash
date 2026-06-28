import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { obs as fixtureObs, stepFrom } from "./observation-fixtures";
import { applyOutlierSelectionToStep } from "./outlier-selection";
import {
  computeCostComparison,
  computeCostTrend,
  computePeriodDeltas,
  computeTimingTrend,
  computeTrend,
  median,
  percentChange,
  periodCutoffs,
  rangeMonths,
  trendDirection,
} from "./period-trends";

import type {
  CostData,
  MonthlyBucket,
  Observation,
  SiteNode,
  StepStats,
} from "./types";

function obs(month: string, value: number): Observation {
  return { date: `${month}-15`, value };
}

const zeroStats: StepStats = {
  n: 0,
  mean: 0,
  median: 0,
  std: 0,
  min: 0,
  max: 0,
  p25: 0,
  p75: 0,
  p85: 0,
  p95: 0,
};

function cost(unitPrice: number | null): CostData {
  return { unit_price: unitPrice, currency: "EUR" };
}

function kgDayMonth(
  month: string,
  totalKgDays: number,
  count = 1,
): MonthlyBucket {
  return {
    month,
    mean: null,
    median: null,
    n: count,
    total_kg_days: totalKgDays,
  };
}

function siteNode(overrides: Partial<SiteNode>): SiteNode {
  return {
    id: "n",
    label: "Node",
    type: "intermediate_dwell",
    material: null,
    plant: "PL-A",
    stats: zeroStats,
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
    products: [{ id: "p1", name: "P1" }],
    ...overrides,
  };
}

describe("rangeMonths", () => {
  it("maps tokens to month counts", () => {
    expect(rangeMonths("3m")).toBe(3);
    expect(rangeMonths("6m")).toBe(6);
    expect(rangeMonths("12m")).toBe(12);
  });
});

describe("median", () => {
  it("returns null on empty", () => expect(median([])).toBeNull());
  it("handles odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("averages the two middle values for even length", () =>
    expect(median([1, 2, 3, 4])).toBe(2.5));
});

describe("percentChange", () => {
  it("computes a relative change", () =>
    expect(percentChange(120, 100)).toBeCloseTo(20, 6));
  it("returns null when previous is zero or a value is null", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(null, 100)).toBeNull();
    expect(percentChange(100, null)).toBeNull();
  });
});

describe("trendDirection", () => {
  it("classifies within the +/-5% flat band", () => {
    expect(trendDirection(null)).toBe("unknown");
    expect(trendDirection(4.9)).toBe("flat");
    expect(trendDirection(-4.9)).toBe("flat");
    expect(trendDirection(6)).toBe("worsening");
    expect(trendDirection(-6)).toBe("improving");
  });
});

describe("period helpers anchored to a fixed clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("periodCutoffs derives the current and previous windows", () => {
    // now=2026-06, 6m -> current 2026-01..2026-06; previous 2025-07..2025-12
    expect(periodCutoffs("6m")).toEqual({
      currentFrom: "2026-01",
      previousFrom: "2025-07",
      previousTo: "2025-12",
    });
  });

  it("computeTrend compares current vs previous medians (6m window)", () => {
    const observations: Observation[] = [
      obs("2025-07", 40),
      obs("2025-09", 60),
      obs("2026-01", 10),
      obs("2026-03", 20),
    ];

    const trend = computeTrend(observations, "6m");
    expect(trend.currentValue).toBe(15);
    expect(trend.previousValue).toBe(50);
    expect(trend.currentN).toBe(2);
    expect(trend.previousN).toBe(2);
    expect(trend.pctChange).toBeCloseTo(-70, 6);
    expect(trend.direction).toBe("improving");
  });

  it("computeTrend uses the selected base measure", () => {
    const observations: Observation[] = [
      obs("2025-07", 10),
      obs("2025-08", 10),
      obs("2025-09", 100),
      obs("2026-01", 20),
      obs("2026-02", 20),
      obs("2026-03", 20),
    ];

    const medianTrend = computeTrend(observations, "6m", "median");
    const meanTrend = computeTrend(observations, "6m", "mean");

    expect(medianTrend.previousValue).toBe(10);
    expect(meanTrend.previousValue).toBeCloseTo(40, 6);
    expect(medianTrend.pctChange).toBeCloseTo(100, 6);
    expect(meanTrend.pctChange).toBeCloseTo(-50, 6);
  });

  it("computeTrend handles the 12m window", () => {
    const observations: Observation[] = [
      obs("2024-08", 100),
      obs("2025-02", 100),
      obs("2025-08", 120),
      obs("2026-02", 120),
    ];

    const trend = computeTrend(observations, "12m");
    expect(trend.currentValue).toBe(120);
    expect(trend.previousValue).toBe(100);
    expect(trend.pctChange).toBeCloseTo(20, 6);
    expect(trend.direction).toBe("worsening");
  });

  it("computeTrend reports flat within the band and unknown on zero-previous", () => {
    const flat = computeTrend([obs("2025-07", 102), obs("2026-01", 100)], "6m");
    expect(flat.direction).toBe("flat");
    const zeroPrev = computeTrend(
      [obs("2025-07", 0), obs("2026-01", 10)],
      "6m",
    );
    expect(zeroPrev.previousValue).toBe(0);
    expect(zeroPrev.pctChange).toBeNull();
    expect(zeroPrev.direction).toBe("unknown");
  });

  it("computeTimingTrend mirrors computeTrend over a node's observations", () => {
    const node = siteNode({
      observations: [
        obs("2025-07", 40),
        obs("2025-09", 60),
        obs("2026-01", 10),
        obs("2026-03", 20),
      ],
    });
    const threshold = computeTimingTrend(node, "6m");
    expect(threshold.currentValue).toBe(15);
    expect(threshold.previousValue).toBe(50);
    expect(threshold.pctChange).toBeCloseTo(-70, 6);
  });

  it("computeCostTrend totals carrying cost across windows", () => {
    const node = siteNode({
      cost: cost(100),
      monthly: [kgDayMonth("2025-07", 1000), kgDayMonth("2026-01", 500)],
    });
    const threshold = computeCostTrend(node, "6m", 0.1, 0.336);
    // current window has 2026-01 only, previous window has 2025-07 only
    expect(threshold.currentTotal).toBeCloseTo(
      500 * (100 * (0.1 / 365) + 0.336 / 1000),
      6,
    );
    expect(threshold.previousTotal).toBeCloseTo(
      1000 * (100 * (0.1 / 365) + 0.336 / 1000),
      6,
    );
    expect(threshold.currentN).toBe(1);
    expect(threshold.previousN).toBe(1);
  });

  it("computeCostComparison returns the delta vs the previous window", () => {
    const monthly = [kgDayMonth("2025-07", 1000), kgDayMonth("2026-01", 2000)];
    const cmp = computeCostComparison(monthly, 100, 0.1, 0.336, "6m");
    // current = 2000 units, previous = 1000 units -> +100%
    expect(cmp.delta).toBeCloseTo(100, 6);
    expect(cmp.previousTotal).toBeCloseTo(
      1000 * (100 * (0.1 / 365) + 0.336 / 1000),
      6,
    );
  });

  it("computePeriodDeltas produces per-stat percentage deltas", () => {
    const observations: Observation[] = [
      // previous window 2025-07..2025-12
      obs("2025-07", 10),
      obs("2025-08", 20),
      // current window 2026-01..2026-06
      obs("2026-01", 20),
      obs("2026-02", 40),
    ];

    const deltas = computePeriodDeltas(observations, "6m");
    expect(deltas.previousStats?.n).toBe(2);
    expect(deltas.medianPctChange).toBeCloseTo(100, 6);
    expect(deltas.currentRange).not.toBeNull();
    expect(deltas.previousRange).not.toBeNull();
  });

  it("computePeriodDeltas can compare an outlier-filtered historical series", () => {
    const step = stepFrom([
      fixtureObs("2025-07", 10),
      fixtureObs("2025-08", 10),
      fixtureObs("2025-09", 1000),
      fixtureObs("2025-10", 1000),
      fixtureObs("2026-01", 20),
      fixtureObs("2026-02", 20),
      fixtureObs("2026-03", 20),
      fixtureObs("2026-04", 20),
    ]);
    const selected = applyOutlierSelectionToStep(step, true);

    const rawDeltas = computePeriodDeltas(step.observations, "6m");
    const filteredDeltas = computePeriodDeltas(selected.observations, "6m");

    expect(rawDeltas.previousStats?.median).toBe(505);
    expect(rawDeltas.medianPctChange).toBeCloseTo(-96.039, 3);
    expect(filteredDeltas.previousStats?.median).toBe(10);
    expect(filteredDeltas.medianPctChange).toBeCloseTo(100, 6);
  });
});
