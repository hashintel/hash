import { describe, expect, it } from "vitest";

import { emptyStats } from "./observation-fixtures";
import { computeStats } from "./stats";

describe("computeStats", () => {
  it("returns zeroed stats for an empty input", () => {
    expect(computeStats([])).toEqual(emptyStats);
  });

  it("computes mean/median/percentiles with linear interpolation", () => {
    expect(computeStats([10, 20, 30])).toEqual({
      n: 3,
      mean: 20,
      median: 20,
      std: 8.2,
      min: 10,
      max: 30,
      p25: 15,
      p75: 25,
      p85: 27,
      p95: 29,
    });
  });
});
