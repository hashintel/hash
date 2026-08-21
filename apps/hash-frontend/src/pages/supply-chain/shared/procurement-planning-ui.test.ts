import { describe, expect, it } from "vitest";

import {
  planningWarningTexts,
  procurementPlanningTooltipLines,
  procurementStepDisplayLabel,
} from "./procurement-planning-ui";

describe("procurement planning UI", () => {
  it("formats procurement labels for qualified and compact displays", () => {
    const label = "Procurement: Material — Supplier A — Buy";

    expect(procurementStepDisplayLabel(label, "qualified")).toBe(
      "Procurement: Material / Supplier A / Buy",
    );
    expect(procurementStepDisplayLabel(label, "compact")).toBe(
      "Procurement: Material",
    );
  });

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
});
