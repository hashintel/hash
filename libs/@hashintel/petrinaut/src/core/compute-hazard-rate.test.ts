import { describe, expect, it, vi } from "vitest";

import { computeHazardRate } from "./compute-hazard-rate";

describe("computeHazardRates", () => {
  it("computes hazard rates for every joint token combination", () => {
    // GIVEN
    const inputs = [
      {
        placeId: "place-a",
        tokens: ["a0", "a1"],
        weight: 1,
      },
      {
        placeId: "place-b",
        tokens: ["b0", "b1"],
        weight: 1,
      },
    ];

    const lambda = vi.fn(
      ({
        combination,
      }: {
        combination: Array<{
          tokenIndices: number[];
        }>;
      }) =>
        combination
          .flatMap((entry) => entry.tokenIndices)
          .reduce((sum, index) => sum + index, 0),
    );

    // WHEN
    const results = computeHazardRate({
      inputs,
      lambda,
    });

    // THEN
    expect(results).toHaveLength(4);
    expect(results.map((result) => result.hazardRate)).toEqual([0, 1, 1, 2]);
    expect(results[0]?.combination[0]?.tokens).toEqual(["a0"]);
    expect(lambda).toHaveBeenCalledTimes(4);
  });

  it("handles selections that require multiple tokens from the same place", () => {
    // GIVEN
    const inputs = [
      {
        placeId: "place-a",
        tokens: ["a0", "a1", "a2"],
        weight: 2,
      },
    ];

    const results = computeHazardRate({
      inputs,
      lambda: ({ combination }) =>
        combination[0]?.tokenIndices.reduce((sum, index) => sum + index, 0) ??
        0,
    });

    // THEN
    expect(results).toHaveLength(3);
    expect(
      results.map((result) => result.combination[0]?.tokenIndices),
    ).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(results.map((result) => result.hazardRate)).toEqual([1, 2, 3]);
  });

  it("returns empty array when a place cannot satisfy its weight requirement", () => {
    // GIVEN
    const results = computeHazardRate({
      inputs: [
        {
          placeId: "place-a",
          tokens: ["a0"],
          weight: 2,
        },
      ],
      lambda: () => 42,
    });

    // THEN
    expect(results).toEqual([]);
  });

  it("invokes lambda once when a transition has no inputs", () => {
    // GIVEN
    const lambda = vi.fn().mockReturnValue(7);

    // WHEN
    const results = computeHazardRate({
      inputs: [],
      lambda,
    });

    // THEN
    expect(lambda).toHaveBeenCalledTimes(1);
    expect(lambda).toHaveBeenCalledWith({ combination: [] });
    expect(results).toEqual([
      {
        combination: [],
        hazardRate: 7,
      },
    ]);
  });
});
