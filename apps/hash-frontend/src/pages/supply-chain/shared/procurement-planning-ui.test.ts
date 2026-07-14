import { describe, expect, it } from "vitest";

import {
  observedSpreadNote,
  planningWarningTexts,
  procurementPlanningTooltipLines,
} from "./procurement-planning-ui";

describe("procurement planning UI", () => {
  it("uses producer labels for the applicable source and distinct alternatives", () => {
    const source = {
      label: "Preferred source",
      system: "source-system",
      table: "source-table",
      source_id: "source-1",
      material: "MAT-1",
      site: "SITE-1",
      supplier_id: "SUP-1",
      basis: "ordinary",
      plan_days: 14,
      dock_to_stock_days: 2,
      match_level: "exact_basis",
    };
    const alternative = {
      label: "Material-level source",
      plan_days: 21,
      system: "alternative-system",
    };

    expect(
      procurementPlanningTooltipLines(source, [
        alternative,
        alternative,
        { label: "Second source", plan_days: null },
      ]),
    ).toEqual([
      "Applicable — Preferred source: 14 days",
      "Alternative — Material-level source: 21 days",
      "Alternative — Second source: –",
    ]);
  });

  it("shows only distinct warning-level producer messages", () => {
    expect(
      planningWarningTexts([
        { code: "one", level: "warning", text: "Review this parameter." },
        { code: "two", level: "warning", text: "Review this parameter." },
        { code: "three", level: "info", text: "Audit metadata." },
      ]),
    ).toEqual(["Review this parameter."]);
  });

  it("suppresses observed spread below ten samples", () => {
    expect(observedSpreadNote([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it("retains the middle-50% spread for ten or more samples", () => {
    expect(observedSpreadNote([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(
      "Median 6d · middle 50% of events: 3d–8d · n=10",
    );
  });
});
