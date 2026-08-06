import { describe, expect, it } from "vitest";

import { segmentStats } from "./segment-stats";

describe("segmentStats", () => {
  it("computes mean, median, and nearest-rank percentiles", () => {
    const result = segmentStats([1, 2, 3, 4, 5, null], false);

    expect(result).toMatchObject({
      mean: 3,
      median: 3,
      p25: 2,
      p75: 4,
      p95: 5,
      n: 5,
    });
  });

  it("uses one-based nearest ranks for even-sized samples", () => {
    const result = segmentStats([1, 2, 3, 4], false);

    expect(result).toMatchObject({
      p25: 1,
      p75: 3,
      p95: 4,
    });
  });

  it("excludes Tukey outliers from the mean only", () => {
    const result = segmentStats([1, 1, 2, 2, 100], true);

    expect(result).toMatchObject({
      mean: 1.5,
      median: 2,
      p95: 100,
      n: 5,
    });
  });
});
