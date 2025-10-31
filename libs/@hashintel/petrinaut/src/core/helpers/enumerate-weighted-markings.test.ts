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
  it("yields [[]] when no places are provided", () => {
    const iterator = enumerateWeightedMarkingIndicesGenerator([]);
    expect(Array.from(iterator)).toEqual([[]]);
  });

  it("yields nothing when a weight exceeds the token count", () => {
    const iterator = enumerateWeightedMarkingIndicesGenerator([
      { count: 2, weight: 3 },
    ]);
    expect(Array.from(iterator)).toEqual([]);
  });

  it("handles single place with weight 0", () => {
    const places = [{ count: 3, weight: 0 }];
    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));
    expect(result).toEqual([[[]]]);
  });

  it("handles single place with single token", () => {
    const places = [{ count: 1, weight: 1 }];
    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));
    expect(result).toEqual([[[0]]]);
  });

  it("generates all 2-combinations from 3 tokens in single place", () => {
    const places = [{ count: 3, weight: 2 }];
    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

    expect(result).toEqual([[[0, 1]], [[0, 2]], [[1, 2]]]);
  });

  it("generates structured arrays for two places", () => {
    const places = [
      { count: 3, weight: 2 },
      { count: 3, weight: 2 },
    ];

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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

    const result = Array.from(enumerateWeightedMarkingIndicesGenerator(places));

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
});
