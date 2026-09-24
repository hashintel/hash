import { describe, expect, it } from "vitest";

import { asImportances } from "./as-importances";

describe("asImportances", () => {
  it("keeps a well-formed block", () => {
    expect(
      asImportances({
        values: { rate: 0.75, count: 0.25 },
        completedTrials: 50,
      }),
    ).toEqual({ values: { rate: 0.75, count: 0.25 }, completedTrials: 50 });
  });

  it("drops anything malformed rather than throwing", () => {
    expect(asImportances(undefined)).toBeUndefined();
    expect(asImportances(null)).toBeUndefined();
    expect(asImportances([])).toBeUndefined();
    expect(asImportances({ values: {}, completedTrials: 0 })).toBeUndefined();
    expect(asImportances({ values: {}, completedTrials: 1.5 })).toBeUndefined();
    expect(asImportances({ values: [], completedTrials: 3 })).toBeUndefined();
    expect(
      asImportances({ values: { rate: "0.5" }, completedTrials: 3 }),
    ).toBeUndefined();
    expect(
      asImportances({ values: { rate: 1.5 }, completedTrials: 3 }),
    ).toBeUndefined();
    expect(
      asImportances({ values: { rate: Number.NaN }, completedTrials: 3 }),
    ).toBeUndefined();
  });
});
