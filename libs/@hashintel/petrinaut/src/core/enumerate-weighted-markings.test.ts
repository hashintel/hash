import { describe, expect, it } from "vitest";

import { enumerateWeightedMarkingIndices } from "./enumerate-weighted-markings";

describe("enumerateWeightedMarkingIndices", () => {
  it("returns empty array when no places are provided", () => {
    // GIVEN
    const places: { tokenCount: number; weight: number }[] = [];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[]]);
  });

  it("returns empty array when weight exceeds token count", () => {
    // GIVEN
    const places = [{ tokenCount: 2, weight: 3 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([]);
  });

  it("handles single place with weight 0", () => {
    // GIVEN
    const places = [{ tokenCount: 3, weight: 0 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[]]);
  });

  it("handles single place with single token", () => {
    // GIVEN
    const places = [{ tokenCount: 1, weight: 1 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[0]]);
  });

  it("generates all 2-combinations from 3 tokens in single place", () => {
    // GIVEN
    const places = [{ tokenCount: 3, weight: 2 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("generates all 3-combinations from 4 tokens in single place", () => {
    // GIVEN
    const places = [{ tokenCount: 4, weight: 3 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 3],
    ]);
  });

  it("generates Cartesian product for two places", () => {
    // GIVEN
    const places = [
      { tokenCount: 3, weight: 2 },
      { tokenCount: 3, weight: 2 },
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    // First place combinations: [0,1], [0,2], [1,2]
    // Second place combinations: [0,1], [0,2], [1,2]
    // Cartesian product should have 3 × 3 = 9 elements
    expect(result).toEqual([
      [0, 1, 0, 1],
      [0, 1, 0, 2],
      [0, 1, 1, 2],
      [0, 2, 0, 1],
      [0, 2, 0, 2],
      [0, 2, 1, 2],
      [1, 2, 0, 1],
      [1, 2, 0, 2],
      [1, 2, 1, 2],
    ]);
  });

  it("handles three places with different weights", () => {
    // GIVEN
    const places = [
      { tokenCount: 2, weight: 1 }, // combinations: [0], [1]
      { tokenCount: 2, weight: 2 }, // combinations: [0,1]
      { tokenCount: 3, weight: 1 }, // combinations: [0], [1], [2]
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    // Expected: 2 × 1 × 3 = 6 combinations
    expect(result).toEqual([
      [0, 0, 1, 0],
      [0, 0, 1, 1],
      [0, 0, 1, 2],
      [1, 0, 1, 0],
      [1, 0, 1, 1],
      [1, 0, 1, 2],
    ]);
  });

  it("returns empty when one place has invalid weight", () => {
    // GIVEN
    const places = [
      { tokenCount: 3, weight: 2 },
      { tokenCount: 2, weight: 5 }, // invalid: weight > tokenCount
      { tokenCount: 3, weight: 1 },
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([]);
  });

  it("handles all tokens selected from each place", () => {
    // GIVEN
    const places = [
      { tokenCount: 2, weight: 2 },
      { tokenCount: 3, weight: 3 },
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    // Only one combination per place when selecting all tokens
    expect(result).toEqual([[0, 1, 0, 1, 2]]);
  });

  it("handles mixed zero and non-zero weights", () => {
    // GIVEN
    const places = [
      { tokenCount: 2, weight: 0 },
      { tokenCount: 3, weight: 2 },
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    // First place contributes nothing (empty combination)
    // Second place has 3 combinations
    expect(result).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("generates correct number of combinations for larger example", () => {
    // GIVEN
    const places = [
      { tokenCount: 4, weight: 2 }, // C(4,2) = 6
      { tokenCount: 3, weight: 2 }, // C(3,2) = 3
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    // Total combinations: 6 × 3 = 18
    expect(result).toHaveLength(18);
    // Verify first and last combinations
    expect(result[0]).toEqual([0, 1, 0, 1]);
    expect(result[17]).toEqual([2, 3, 1, 2]);
  });
});
