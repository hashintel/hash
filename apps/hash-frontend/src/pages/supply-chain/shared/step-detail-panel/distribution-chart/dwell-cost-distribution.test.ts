import { describe, expect, it } from "vitest";

import { dwellCostDistributionValues } from "./dwell-cost-distribution";

import type { StepDetail } from "../../types";

describe("dwellCostDistributionValues", () => {
  it("applies WACC and storage cost to each selected event's kg-days", () => {
    const step = {
      cost: { unit_price: 365, currency: "GBP" },
      ref_date_col: "exit_date",
      value_col: "dwell_days",
      observations: [
        { date: "2026-06-01", value: 5 },
        { date: "2026-06-03", value: 8 },
      ],
      detail_rows: {
        columns: [],
        rows: [
          { exit_date: "2026-06-01", dwell_days: 5, kg_days: 100 },
          { exit_date: "2026-06-02", dwell_days: 50, kg_days: 999 },
          { exit_date: "2026-06-03", dwell_days: 8, kg_days: 240 },
        ],
      },
    } as unknown as StepDetail;

    // Rate per kg-day = 365 × (10% / 365) + 400 / 1,000 = 0.5.
    expect(dwellCostDistributionValues(step, 0.1, 400)).toEqual([50, 120]);
  });

  it("returns no values when unit price or row-level kg-days are unavailable", () => {
    const step = {
      cost: { unit_price: null, currency: "GBP" },
      ref_date_col: "exit_date",
      value_col: "dwell_days",
      observations: [{ date: "2026-06-01", value: 5 }],
      detail_rows: {
        columns: [],
        rows: [{ exit_date: "2026-06-01", dwell_days: 5 }],
      },
    } as unknown as StepDetail;

    expect(dwellCostDistributionValues(step, 0.1, 0.4)).toEqual([]);
  });
});
