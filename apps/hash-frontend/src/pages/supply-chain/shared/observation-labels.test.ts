import { describe, expect, it } from "vitest";

import {
  countNoun,
  countTooltip,
  dateAnchorLabel,
  effectiveTimingGrain,
  shortCountLabel,
} from "./observation-labels";

describe("QA observation labels", () => {
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
    expect(dateAnchorLabel(qaCampaign)).toBe("QA release date");
    expect(
      countTooltip({
        ...qaCampaign,
        count: 7,
        nCampaigns: 7,
        nBatches: 20,
      }),
    ).toContain("7 campaigns across 20 batches");
  });

  it("treats omitted and explicit batch QA grain as batches", () => {
    const omittedBatch = {
      id: "prod_to_qa",
      label: "Production to QA",
      type: "qa_hold" as const,
    };
    const explicitBatch = {
      ...omittedBatch,
      timingGrain: "batch" as const,
    };

    expect(effectiveTimingGrain(omittedBatch)).toBe("batch");
    expect(countNoun(omittedBatch)).toBe("batches");
    expect(countNoun(explicitBatch)).toBe("batches");
    expect(shortCountLabel(12, omittedBatch)).toBe("12 batches");
    expect(
      countTooltip({ ...omittedBatch, count: 12, nBatches: 30 }),
    ).toContain("All-time source coverage: 30 batches.");
    expect(countTooltip({ ...omittedBatch, count: 12 })).toContain(
      "each finished-good batch contributes one QA-hold event",
    );
    expect(dateAnchorLabel(omittedBatch)).toBe("QA release date");
  });

  it("keeps omitted non-QA timing at generic event grain", () => {
    const transit = { type: "transit" as const };
    expect(effectiveTimingGrain(transit)).toBeNull();
    expect(countNoun(transit)).toBe("events");
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
