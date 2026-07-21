import { describe, expect, it } from "vitest";

import { getChartConfigProblems } from "./chart-config-validation.js";

const dataKeys = ["month", "totalValue", "dealCount"];

const validConfig = {
  categoryKey: "month",
  series: [{ type: "bar", name: "Deal value", dataKey: "totalValue" }],
  showTooltip: true,
};

describe("getChartConfigProblems", () => {
  it("accepts a valid config referencing existing data keys", () => {
    expect(getChartConfigProblems(validConfig, dataKeys)).toEqual([]);
  });

  it("reports schema violations for missing required fields", () => {
    const problems = getChartConfigProblems({ series: [] }, dataKeys);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toMatch(/categoryKey/);
  });

  it("reports schema violations for wrongly-typed fields", () => {
    const problems = getChartConfigProblems(
      { ...validConfig, showLegend: "yes" },
      dataKeys,
    );
    expect(problems.join("\n")).toMatch(/showLegend/);
  });

  it("rejects a categoryKey that is not in the data", () => {
    const problems = getChartConfigProblems(
      { ...validConfig, categoryKey: "nonexistent" },
      dataKeys,
    );
    expect(problems.join("\n")).toMatch(/categoryKey "nonexistent"/);
  });

  it("rejects a series dataKey that is not in the data", () => {
    const problems = getChartConfigProblems(
      {
        ...validConfig,
        series: [{ type: "bar", dataKey: "madeUp" }],
      },
      dataKeys,
    );
    expect(problems.join("\n")).toMatch(/dataKey "madeUp"/);
  });

  it("skips data-key checks when no data keys are known", () => {
    expect(getChartConfigProblems(validConfig, [])).toEqual([]);
  });
});
