import { describe, expect, it } from "vitest";

import {
  enumerateWeightedMarkingIndices,
  enumerateWeightedMarkingIndicesGenerator,
} from "./enumerate-weighted-markings";

describe("enumerateWeightedMarkingIndices", () => {
  it("returns empty array when no places are provided", () => {
    // GIVEN
    const places: { count: number; weight: number }[] = [];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[]]);
  });

  it("returns empty array when weight exceeds token count", () => {
    // GIVEN
    const places = [{ count: 2, weight: 3 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([]);
  });

  it("handles single place with weight 0", () => {
    // GIVEN
    const places = [{ count: 3, weight: 0 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[]]);
  });

  it("handles single place with single token", () => {
    // GIVEN
    const places = [{ count: 1, weight: 1 }];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([[0]]);
  });

  it("generates all 2-combinations from 3 tokens in single place", () => {
    // GIVEN
    const places = [{ count: 3, weight: 2 }];

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
    const places = [{ count: 4, weight: 3 }];

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
      { count: 3, weight: 2 },
      { count: 3, weight: 2 },
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
      { count: 2, weight: 1 }, // combinations: [0], [1]
      { count: 2, weight: 2 }, // combinations: [0,1]
      { count: 3, weight: 1 }, // combinations: [0], [1], [2]
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
      { count: 3, weight: 2 },
      { count: 2, weight: 5 }, // invalid: weight > count
      { count: 3, weight: 1 },
    ];

    // WHEN
    const result = enumerateWeightedMarkingIndices(places);

    // THEN
    expect(result).toEqual([]);
  });

  it("handles all tokens selected from each place", () => {
    // GIVEN
    const places = [
      { count: 2, weight: 2 },
      { count: 3, weight: 3 },
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
      { count: 2, weight: 0 },
      { count: 3, weight: 2 },
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
      { count: 4, weight: 2 }, // C(4,2) = 6
      { count: 3, weight: 2 }, // C(3,2) = 3
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

describe("enumerateWeightedMarkingIndicesGenerator", () => {
  /**
   * The generator reuses its yielded arrays between iterations, so collecting
   * a sequence must clone each marking as it arrives.
   */
  function collectMarkings(
    places: { count: number; weight: number }[],
  ): number[][][] {
    return Array.from(
      enumerateWeightedMarkingIndicesGenerator(places),
      (marking) => marking.map((combo) => [...combo]),
    );
  }
  it("yields [[]] when no places are provided", () => {
    expect(collectMarkings([])).toEqual([[]]);
  });

  it("yields nothing when a weight exceeds the token count", () => {
    expect(collectMarkings([{ count: 2, weight: 3 }])).toEqual([]);
  });

  it("handles single place with weight 0", () => {
    const places = [{ count: 3, weight: 0 }];
    const result = collectMarkings(places);
    expect(result).toEqual([[[]]]);
  });

  it("handles single place with single token", () => {
    const places = [{ count: 1, weight: 1 }];
    const result = collectMarkings(places);
    expect(result).toEqual([[[0]]]);
  });

  it("generates all 2-combinations from 3 tokens in single place", () => {
    const places = [{ count: 3, weight: 2 }];
    const result = collectMarkings(places);

    expect(result).toEqual([[[0, 1]], [[0, 2]], [[1, 2]]]);
  });

  it("generates structured arrays for two places", () => {
    const places = [
      { count: 3, weight: 2 },
      { count: 3, weight: 2 },
    ];

    const result = collectMarkings(places);

    // First place combinations: [0,1], [0,2], [1,2]
    // Second place combinations: [0,1], [0,2], [1,2]
    // Cartesian product should have 3 × 3 = 9 elements
    // Each result should be [[place0_combo], [place1_combo]]
    expect(result).toEqual([
      [
        [0, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [0, 2],
      ],
      [
        [0, 1],
        [1, 2],
      ],
      [
        [0, 2],
        [0, 1],
      ],
      [
        [0, 2],
        [0, 2],
      ],
      [
        [0, 2],
        [1, 2],
      ],
      [
        [1, 2],
        [0, 1],
      ],
      [
        [1, 2],
        [0, 2],
      ],
      [
        [1, 2],
        [1, 2],
      ],
    ]);
  });

  it("handles three places with different weights", () => {
    const places = [
      { count: 2, weight: 1 }, // combinations: [0], [1]
      { count: 2, weight: 2 }, // combinations: [0,1]
      { count: 3, weight: 1 }, // combinations: [0], [1], [2]
    ];

    const result = collectMarkings(places);

    // Expected: 2 × 1 × 3 = 6 combinations
    expect(result).toEqual([
      [[0], [0, 1], [0]],
      [[0], [0, 1], [1]],
      [[0], [0, 1], [2]],
      [[1], [0, 1], [0]],
      [[1], [0, 1], [1]],
      [[1], [0, 1], [2]],
    ]);
  });

  it("yields correct structure for all tokens selected", () => {
    const places = [
      { count: 2, weight: 2 },
      { count: 3, weight: 3 },
    ];

    const result = collectMarkings(places);

    // Only one combination per place when selecting all tokens
    expect(result).toEqual([
      [
        [0, 1],
        [0, 1, 2],
      ],
    ]);
  });

  it("handles mixed zero and non-zero weights", () => {
    const places = [
      { count: 2, weight: 0 },
      { count: 3, weight: 2 },
    ];

    const result = collectMarkings(places);

    // First place contributes empty array
    // Second place has 3 combinations
    expect(result).toEqual([
      [[], [0, 1]],
      [[], [0, 2]],
      [[], [1, 2]],
    ]);
  });

  it("generates correct number of combinations for larger example", () => {
    const places = [
      { count: 4, weight: 2 }, // C(4,2) = 6
      { count: 3, weight: 2 }, // C(3,2) = 3
    ];

    const result = collectMarkings(places);

    // Total combinations: 6 × 3 = 18
    expect(result).toHaveLength(18);
    // Verify first and last combinations
    expect(result[0]).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(result[17]).toEqual([
      [2, 3],
      [1, 2],
    ]);
  });

  it("properly isolates place combinations in returned arrays", () => {
    const places = [
      { count: 2, weight: 1 },
      { count: 2, weight: 1 },
    ];

    const result = collectMarkings(places);

    // Each result should have 2 elements (one per place)
    // Each place should have its own array
    expect(result).toEqual([
      [[0], [0]],
      [[0], [1]],
      [[1], [0]],
      [[1], [1]],
    ]);

    // Verify structure: each result is an array of arrays
    for (const marking of result) {
      expect(marking).toHaveLength(2); // 2 places
      expect(Array.isArray(marking[0])).toBe(true);
      expect(Array.isArray(marking[1])).toBe(true);
    }
  });

  it("reuses the yielded marking and its combination arrays between iterations", () => {
    const places = [
      { count: 3, weight: 2 },
      { count: 2, weight: 1 },
    ];

    const yielded = Array.from(
      enumerateWeightedMarkingIndicesGenerator(places),
    );

    // Every yield hands back the same (mutated) structure: consumers that
    // keep a marking past the next iteration must copy it.
    expect(yielded.length).toBe(6);
    for (const marking of yielded) {
      expect(marking).toBe(yielded[0]);
      expect(marking[0]).toBe(yielded[0]![0]);
    }
  });

  it("matches an eager reference implementation on a case matrix", () => {
    /** The pre-lazy algorithm, kept as the ordering oracle. */
    function referenceCombinations(n: number, k: number): number[][] {
      if (k === 0) {
        return [[]];
      }
      if (k > n) {
        return [];
      }
      const result: number[][] = [];
      const backtrack = (start: number, combo: number[]) => {
        if (combo.length === k) {
          result.push([...combo]);
          return;
        }
        for (let i = start; i <= n - (k - combo.length); i++) {
          combo.push(i);
          backtrack(i + 1, combo);
          combo.pop();
        }
      };
      backtrack(0, []);
      return result;
    }

    function referenceMarkings(
      places: { count: number; weight: number }[],
    ): number[][][] {
      const perPlace = places.map((place) =>
        referenceCombinations(place.count, place.weight),
      );
      if (perPlace.some((combos) => combos.length === 0)) {
        return [];
      }
      let acc: number[][][] = [[]];
      for (const combos of perPlace) {
        const next: number[][][] = [];
        for (const partial of acc) {
          for (const combo of combos) {
            next.push([...partial, combo]);
          }
        }
        acc = next;
      }
      return acc;
    }

    const cases: { count: number; weight: number }[][] = [
      [{ count: 5, weight: 2 }],
      [{ count: 6, weight: 3 }],
      [{ count: 7, weight: 1 }],
      [{ count: 4, weight: 4 }],
      [{ count: 4, weight: 0 }],
      [
        { count: 4, weight: 2 },
        { count: 3, weight: 1 },
      ],
      [
        { count: 3, weight: 1 },
        { count: 2, weight: 2 },
        { count: 4, weight: 3 },
      ],
      [
        { count: 2, weight: 0 },
        { count: 3, weight: 2 },
        { count: 2, weight: 1 },
      ],
      [
        { count: 5, weight: 2 },
        { count: 5, weight: 2 },
      ],
    ];

    for (const places of cases) {
      expect(collectMarkings(places)).toEqual(referenceMarkings(places));
    }
  });
});
