import { describe, expect, it } from "vitest";

import {
  addAllMonteCarloMetricValues,
  createMonteCarloMetricHistogramAccumulator,
  createMonteCarloMetricNumericAccumulator,
} from "./accumulators";

describe("Monte Carlo metric accumulators", () => {
  it("treats numeric accumulator state as a monoid under merge", () => {
    const accumulator = createMonteCarloMetricNumericAccumulator("mean");
    const left = addAllMonteCarloMetricValues(accumulator, [1, 2]);
    const middle = addAllMonteCarloMetricValues(accumulator, [3]);
    const right = addAllMonteCarloMetricValues(accumulator, [4, 5]);

    expect(accumulator.merge(accumulator.empty(), left)).toEqual(left);
    expect(accumulator.merge(left, accumulator.empty())).toEqual(left);

    const mergedLeft = accumulator.merge(
      accumulator.merge(left, middle),
      right,
    );
    const mergedRight = accumulator.merge(
      left,
      accumulator.merge(middle, right),
    );

    expect(mergedLeft).toEqual(mergedRight);
    expect(accumulator.read(mergedLeft)).toBe(3);
  });

  it("preserves ordered last values when numeric states are merged", () => {
    const accumulator = createMonteCarloMetricNumericAccumulator("last");
    const left = addAllMonteCarloMetricValues(accumulator, [1, 2]);
    const right = addAllMonteCarloMetricValues(accumulator, [3, 4]);

    expect(accumulator.read(accumulator.merge(left, right))).toBe(4);
    expect(accumulator.read(accumulator.merge(right, left))).toBe(2);
  });

  it("merges histogram accumulator states by adding bin frequencies", () => {
    const accumulator = createMonteCarloMetricHistogramAccumulator({
      width: 2,
    });
    const left = addAllMonteCarloMetricValues(accumulator, [1, 2, 3]);
    const right = addAllMonteCarloMetricValues(accumulator, [2, 4]);

    expect(
      accumulator.read(accumulator.merge(accumulator.empty(), left)),
    ).toEqual(accumulator.read(left));
    expect(accumulator.read(accumulator.merge(left, right))).toEqual([
      [0, 1],
      [2, 3],
      [4, 1],
    ]);
  });
});
