import { describe, expect, it } from "vitest";

import {
  shouldShowProcurementPlanningRow,
  summarizeProcurementPlanning,
} from "./procurement-planning";

import type { Observation } from "./types";

function observation(value: number): Observation {
  return {
    date: "2026-01-01",
    value,
  };
}

describe("summarizeProcurementPlanning", () => {
  it("keeps observed zero-day profiles visible in planning tables", () => {
    expect(shouldShowProcurementPlanningRow(0, 2)).toBe(true);
    expect(shouldShowProcurementPlanningRow(null, 2)).toBe(false);
    expect(shouldShowProcurementPlanningRow(0, 0)).toBe(false);
  });

  it("compares every PO with the profile's node-level parameter", () => {
    const summary = summarizeProcurementPlanning(
      [observation(12), observation(18), observation(30)],
      20,
    );

    expect(summary.pctExceedingPlan).toBe(33.3);
    expect(summary.meanVariancePct).toBe(0);
    expect(summary.medianVariancePct).toBe(-10);
  });

  it("returns null metrics when the node has no parameter", () => {
    const summary = summarizeProcurementPlanning(
      [observation(8), observation(12)],
      null,
    );
    expect(summary.pctExceedingPlan).toBeNull();
    expect(summary.meanVariancePct).toBeNull();
    expect(summary.medianVariancePct).toBeNull();
  });

  it("does not calculate percentage variance for zero-day plans", () => {
    const summary = summarizeProcurementPlanning(
      [observation(0), observation(2)],
      0,
    );
    expect(summary.pctExceedingPlan).toBe(50);
    expect(summary.meanVariancePct).toBeNull();
    expect(summary.medianVariancePct).toBeNull();
  });
});
