import { describe, expect, it } from "vitest";

import { UniformGrid } from "./uniform-grid";

/** Brute-force reference: map of "cx,cy" → ascending point indices. */
function referenceBuckets(
  x: number[],
  y: number[],
  cellSize: number,
): Map<string, number[]> {
  const buckets = new Map<string, number[]>();
  for (let point = 0; point < x.length; point++) {
    const key = `${Math.floor(x[point]! / cellSize)},${Math.floor(
      y[point]! / cellSize,
    )}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(point);
    } else {
      buckets.set(key, [point]);
    }
  }
  return buckets;
}

function membersOf(grid: UniformGrid, cellX: number, cellY: number): number[] {
  const bucket = grid.bucketAt(cellX, cellY);
  if (bucket < 0) {
    return [];
  }
  const members: number[] = [];
  for (
    let index = grid.starts[bucket]!;
    index < grid.starts[bucket + 1]!;
    index++
  ) {
    members.push(grid.order[index]!);
  }
  return members;
}

describe("UniformGrid", () => {
  it("matches a reference bucketing, members ascending by index", () => {
    const count = 500;
    const x: number[] = [];
    const y: number[] = [];
    // Deterministic pseudo-random points, including negative coordinates.
    let seed = 12345;
    const next = () => {
      // eslint-disable-next-line no-bitwise -- LCG step needs the u32 wrap
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000 - 0.5;
    };
    for (let point = 0; point < count; point++) {
      x.push(next() * 1000);
      y.push(next() * 1000);
    }

    const cellSize = 37.5;
    const grid = new UniformGrid();
    grid.build(x, y, count, cellSize);

    const reference = referenceBuckets(x, y, cellSize);
    let referenceTotal = 0;
    for (const [key, expected] of reference) {
      const [cellX, cellY] = key.split(",").map(Number) as [number, number];
      expect(membersOf(grid, cellX, cellY)).toEqual(expected);
      referenceTotal += expected.length;
    }
    expect(referenceTotal).toBe(count);
    expect(grid.bucketCount).toBe(reference.size);
  });

  it("returns -1 for empty cells", () => {
    const grid = new UniformGrid();
    grid.build([0, 10], [0, 10], 2, 4);
    expect(grid.bucketAt(1000, 1000)).toBe(-1);
    expect(grid.bucketAt(-1000, 5)).toBe(-1);
  });

  it("stores per-point cell coordinates", () => {
    const grid = new UniformGrid();
    grid.build([-7, 0, 9], [3, 0, -1], 3, 4);
    expect(grid.cellXOf(0)).toBe(Math.floor(-7 / 4));
    expect(grid.cellYOf(0)).toBe(Math.floor(3 / 4));
    expect(grid.cellXOf(2)).toBe(Math.floor(9 / 4));
    expect(grid.cellYOf(2)).toBe(Math.floor(-1 / 4));
    expect(grid.bucketOfPoint(1)).toBe(grid.bucketAt(0, 0));
  });

  it("reuses buffers across rebuilds without stale state", () => {
    const grid = new UniformGrid();
    grid.build([0, 1, 2, 100], [0, 1, 2, 100], 4, 8);
    expect(membersOf(grid, 0, 0)).toEqual([0, 1, 2]);
    expect(membersOf(grid, 12, 12)).toEqual([3]);

    // Rebuild with fewer points elsewhere: old cells must be gone.
    grid.build([50], [50], 1, 8);
    expect(membersOf(grid, 0, 0)).toEqual([]);
    expect(membersOf(grid, 12, 12)).toEqual([]);
    expect(membersOf(grid, 6, 6)).toEqual([0]);
    expect(grid.bucketCount).toBe(1);
  });

  it("handles an empty point set", () => {
    const grid = new UniformGrid();
    grid.build([], [], 0, 10);
    expect(grid.bucketCount).toBe(0);
    expect(grid.bucketAt(0, 0)).toBe(-1);
  });
});
