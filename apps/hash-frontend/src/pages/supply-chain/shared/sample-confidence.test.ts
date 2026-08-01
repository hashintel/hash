import { describe, expect, it } from "vitest";

import {
  combinedSampleTier,
  isExcludedLowSample,
  sampleTier,
} from "./sample-confidence";

describe("sample confidence", () => {
  it.each([
    [0, "none"],
    [1, "low"],
    [4, "low"],
    [5, "limited"],
    [9, "limited"],
    [10, "good"],
  ] as const)("classifies %i observations as %s", (count, expected) => {
    expect(sampleTier(count)).toBe(expected);
  });

  it("uses the weakest populated period", () => {
    expect(combinedSampleTier(8, 3)).toBe("low");
    expect(combinedSampleTier(12, 7)).toBe("limited");
    expect(combinedSampleTier(12, 0)).toBe("good");
  });

  it("excludes only the low tier", () => {
    expect(isExcludedLowSample(4)).toBe(true);
    expect(isExcludedLowSample(5)).toBe(false);
    expect(isExcludedLowSample(9)).toBe(false);
  });
});
