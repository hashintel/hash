import { describe, expect, it } from "vitest";

import {
  columnDensity,
  formatAxisTick,
  niceAxisTicks,
  rasterizeBins,
} from "./bin-histogram-raster";

/** `n` integer bins starting at 0, each holding one sample. */
const integerBins = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, index) => [index, 1]);

describe("rasterizeBins", () => {
  it("tiles the plot with adjacent columns and no gaps", () => {
    const { columns } = rasterizeBins(integerBins(8), 100);

    expect(columns[0]!.left).toBe(0);
    expect(columns.at(-1)!.right).toBe(100);
    for (const [index, column] of columns.entries()) {
      expect(column.right).toBeGreaterThan(column.left);
      if (index > 0) {
        expect(column.left).toBe(columns[index - 1]!.right);
      }
    }
  });

  it("keeps every sample when bins are narrower than a pixel", () => {
    const bins = integerBins(500);
    const { columns } = rasterizeBins(bins, 80);

    // Bins merge into at most one column per pixel, and merging pools counts
    // rather than dropping them.
    expect(columns.length).toBeLessThanOrEqual(80);
    const total = columns.reduce((sum, column) => sum + column.count, 0);
    const merged = columns.reduce((sum, column) => sum + column.binCount, 0);
    expect(total).toBe(500);
    expect(merged).toBe(500);
  });

  it("levels uneven merges, so a remainder is not a spike", () => {
    // 500 flat bins over 180 pixels merge two or three at a time; summing
    // would draw the three-bin columns half again as tall as their
    // neighbours, a ripple that is not in the data.
    const { columns, maxDensity } = rasterizeBins(integerBins(500), 180);

    expect(
      new Set(columns.map((column) => column.binCount)).size,
    ).toBeGreaterThan(1);
    for (const column of columns) {
      expect(columnDensity(column)).toBe(1);
    }
    expect(maxDensity).toBe(1);
  });

  it("gives each bin its own column when there is room", () => {
    const { columns, maxDensity } = rasterizeBins(
      [
        [0, 5],
        [1, 9],
        [2, 1],
      ],
      300,
    );

    expect(columns).toHaveLength(3);
    expect(columns.map((column) => column.count)).toEqual([5, 9, 1]);
    // Nothing merged, so the axis top is the largest bin's own frequency.
    expect(columns.every((column) => column.binCount === 1)).toBe(true);
    expect(maxDensity).toBe(9);
  });

  it("spans the outer edges of the first and last bins", () => {
    // Step 2 between values, so the domain reaches half a step past each end.
    const { domainMin, domainMax } = rasterizeBins(
      [
        [10, 1],
        [12, 1],
        [14, 1],
      ],
      100,
    );

    expect(domainMin).toBe(9);
    expect(domainMax).toBe(15);
  });

  it("sorts unordered bins before rasterizing", () => {
    const { columns } = rasterizeBins(
      [
        [2, 3],
        [0, 1],
        [1, 2],
      ],
      300,
    );

    expect(columns.map((column) => column.valueFrom)).toEqual([0, 1, 2]);
    expect(columns.map((column) => column.count)).toEqual([1, 2, 3]);
  });

  it("draws a single bin one unit wide", () => {
    const { columns, domainMin, domainMax } = rasterizeBins([[7, 4]], 60);

    expect(columns).toEqual([
      { left: 0, right: 60, count: 4, binCount: 1, valueFrom: 7, valueTo: 7 },
    ]);
    expect(domainMin).toBe(6.5);
    expect(domainMax).toBe(7.5);
  });

  it("has nothing to draw without bins or width", () => {
    expect(rasterizeBins([], 100).columns).toEqual([]);
    expect(rasterizeBins(integerBins(4), 0).columns).toEqual([]);
  });
});

describe("niceAxisTicks", () => {
  it("picks round steps covering the range", () => {
    expect(niceAxisTicks(0, 2038, 4)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceAxisTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("handles fractional ranges without drift", () => {
    expect(niceAxisTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("respects a minimum step, so a count axis stays whole", () => {
    expect(niceAxisTicks(0, 1, 2, 1)).toEqual([0, 1]);
    expect(niceAxisTicks(0, 3, 2, 1)).toEqual([0, 1, 2, 3]);
    // Below the floor the step is free to be fractional again.
    expect(niceAxisTicks(0, 0.5, 2, 0)).toEqual([0, 0.2, 0.4]);
  });

  it("returns the value itself for an empty range", () => {
    expect(niceAxisTicks(5, 5)).toEqual([5]);
    expect(niceAxisTicks(5, 1)).toEqual([5]);
  });
});

describe("formatAxisTick", () => {
  it("keeps small numbers literal and shortens large ones", () => {
    expect(formatAxisTick(0)).toBe("0");
    expect(formatAxisTick(2038)).toBe("2038");
    expect(formatAxisTick(0.2)).toBe("0.2");
    expect(formatAxisTick(10_000)).toBe("10k");
    expect(formatAxisTick(25_000)).toBe("25k");
    expect(formatAxisTick(1_500_000)).toBe("1.5M");
  });
});
