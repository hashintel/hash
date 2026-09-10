import { describe, expect, it } from "vitest";

import {
  quadTreeLevels,
  surfaceColumnCount,
  surfacePositions,
} from "./surface-sampling";

describe("surfaceColumnCount", () => {
  it("counts every position of a short axis and eleven of a long one, as many as surfacePositions lists", () => {
    expect(surfaceColumnCount({ stepCount: 4 })).toBe(5);
    expect(surfaceColumnCount({ stepCount: 50 })).toBe(11);
    for (const stepCount of [1, 4, 9, 10, 11, 12, 50, 1000]) {
      expect(surfacePositions({ stepCount })).toHaveLength(
        surfaceColumnCount({ stepCount }),
      );
    }
  });
});

describe("surfacePositions", () => {
  it("spreads at most eleven positions evenly over the axis", () => {
    expect(surfacePositions({ stepCount: 50 })).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
    ]);
  });

  it("visits every position of a short axis once", () => {
    expect(surfacePositions({ stepCount: 4 })).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("quadTreeLevels", () => {
  it("starts with the four corners and refines by splitting in two per axis", () => {
    const levels = quadTreeLevels(5, 5);
    expect(levels[0]).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
      { x: 4, y: 4 },
    ]);
    // Level 1: the centre cross of the 3×3 lattice — centre + edge midpoints.
    expect(levels[1]).toEqual(
      expect.arrayContaining([
        { x: 2, y: 2 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
        { x: 4, y: 2 },
        { x: 2, y: 4 },
      ]),
    );
    expect(levels[1]).toHaveLength(5);
  });

  it("levels are disjoint and cover the whole grid", () => {
    for (const [nx, ny] of [
      [5, 5],
      [11, 11],
      [3, 4],
      [1, 7],
    ] as const) {
      const levels = quadTreeLevels(nx, ny);
      const seen = new Set<string>();
      for (const level of levels) {
        for (const { x, y } of level) {
          const key = `${x},${y}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      expect(seen.size).toBe(nx * ny);
    }
  });

  it("grids off the power-of-two lattice still refine gradually", () => {
    // 11 positions per axis: rounded lattice levels, no single giant tail.
    const levels = quadTreeLevels(11, 11);
    expect(levels.map((level) => level.length)).toEqual([4, 5, 16, 56, 40]);
  });
});
