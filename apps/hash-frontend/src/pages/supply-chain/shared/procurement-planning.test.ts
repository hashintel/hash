import { describe, expect, it } from "vitest";

import {
  shouldShowProcurementPlanningRow,
  summarizeProcurementPlanning,
} from "./procurement-planning";

import type { Observation } from "./types";

function observation(
  value: number,
  planDays?: number | null,
  provenance?: "profile" | "fallback",
): Observation {
  return {
    date: "2026-01-01",
    value,
    plan_days: planDays,
    plan_provenance: provenance,
    variance_days: planDays == null ? null : value - planDays,
  };
}

describe("summarizeProcurementPlanning", () => {
  it("keeps observed zero-day profiles visible in planning tables", () => {
    expect(shouldShowProcurementPlanningRow(0, 2)).toBe(true);
    expect(shouldShowProcurementPlanningRow(null, 2)).toBe(false);
    expect(shouldShowProcurementPlanningRow(0, 0)).toBe(false);
  });

  it("compares every PO with its own applicable parameter", () => {
    const summary = summarizeProcurementPlanning([
      observation(12, 10, "profile"),
      observation(18, 20, "profile"),
      observation(30, 20, "fallback"),
    ]);

    expect(summary.observationCount).toBe(3);
    expect(summary.plannedCount).toBe(3);
    expect(summary.pctExceedingPlan).toBe(66.7);
    expect(summary.meanVarianceDays).toBe(3.3);
    expect(summary.medianVarianceDays).toBe(2);
    expect(summary.applicablePlan).toBeNull();
    expect(summary.planMin).toBe(10);
    expect(summary.planMax).toBe(20);
    expect(summary.matchedCoveragePct).toBe(66.7);
  });

  it("uses a legacy scalar only when observation plans are absent", () => {
    const summary = summarizeProcurementPlanning(
      [observation(8), observation(12)],
      10,
    );
    expect(summary.coveragePct).toBe(100);
    expect(summary.pctExceedingPlan).toBe(50);
    expect(summary.medianVarianceDays).toBe(0);
    expect(summary.applicablePlan).toBe(10);
  });

  it("does not calculate percentage variance for zero-day plans", () => {
    const summary = summarizeProcurementPlanning([
      observation(0, 0, "profile"),
      observation(2, 0, "profile"),
    ]);
    expect(summary.pctExceedingPlan).toBe(50);
    expect(summary.meanVariancePct).toBeNull();
    expect(summary.medianVariancePct).toBeNull();
  });

  it("reports incomplete planning coverage", () => {
    const summary = summarizeProcurementPlanning([
      observation(8, 10, "profile"),
      observation(12),
    ]);
    expect(summary.coveragePct).toBe(50);
    expect(summary.plannedCount).toBe(1);
  });
});
