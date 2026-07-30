import { describe, expect, it } from "vitest";

import { countNoun, countTooltip, shortCountLabel } from "./observation-labels";

describe("campaign observation labels", () => {
  const qaCampaign = {
    id: "prod_to_qa",
    label: "Production to QA",
    type: "qa_hold" as const,
    timingGrain: "campaign" as const,
  };

  it("labels campaign-grain QA timing observations as campaigns", () => {
    expect(countNoun(qaCampaign)).toBe("campaigns");
    expect(shortCountLabel(7, qaCampaign)).toBe("7 campaigns");
    expect(
      countTooltip({ ...qaCampaign, count: 7, rangeLabel: "12m" }),
    ).toContain("7 campaigns in the last 12 months");
  });

  it("keeps yield and consumption terminology ahead of timing grain", () => {
    expect(countNoun({ ...qaCampaign, dimension: "yield" })).toBe(
      "production orders",
    );
    expect(
      countNoun({
        ...qaCampaign,
        dimension: "consumption",
        selectedComponent: true,
      }),
    ).toBe("component events");
  });
});
