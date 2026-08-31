import { describe, expect, it } from "vitest";

import {
  bluesColor,
  coarseToFineOrder,
  quadTreeLevels,
  contourLevels,
  idwRaster,
  marchingSquaresSegments,
  sweepCellObjective,
} from "./contour-grid";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

describe("coarseToFineOrder", () => {
  it("visits corners and midpoints before in-between cells", () => {
    const order = coarseToFineOrder(5, 5);
    expect(order).toHaveLength(25);

    const rankOf = (x: number, y: number) =>
      order.findIndex((cell) => cell.x === x && cell.y === y);

    // The four corners come before the grid centre, which comes before an
    // odd-index cell that only exists on the finest lattice.
    expect(rankOf(0, 0)).toBeLessThan(rankOf(2, 2));
    expect(rankOf(4, 4)).toBeLessThan(rankOf(2, 2));
    expect(rankOf(2, 2)).toBeLessThan(rankOf(1, 2));
    expect(rankOf(1, 2)).toBeLessThan(-0.5 + 25);
  });

  it("covers every cell exactly once", () => {
    const order = coarseToFineOrder(3, 4);
    const keys = new Set(order.map((cell) => `${cell.x},${cell.y}`));
    expect(keys.size).toBe(12);
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

describe("idwRaster", () => {
  it("is flat at the sample value with a single sample", () => {
    const raster = idwRaster({
      samples: [{ x: 1, y: 1, value: 7 }],
      nx: 3,
      ny: 3,
      width: 4,
      height: 4,
    });
    expect([...raster].every((value) => Math.abs(value - 7) < 1e-9)).toBe(true);
  });

  it("hits sample values exactly at their raster positions", () => {
    // 2x2 grid rendered on a 2x2 raster: each raster corner is a sample.
    const raster = idwRaster({
      samples: [
        { x: 0, y: 0, value: 1 },
        { x: 1, y: 0, value: 2 },
        { x: 0, y: 1, value: 3 },
        { x: 1, y: 1, value: 4 },
      ],
      nx: 2,
      ny: 2,
      width: 2,
      height: 2,
    });
    // Raster rows are top-down; grid y is up, so grid (0,1)=3 is top-left.
    expect([...raster]).toEqual([3, 4, 1, 2]);
  });
});

describe("marchingSquaresSegments", () => {
  it("draws a vertical iso-line through a horizontal ramp", () => {
    // 3x2 raster ramping 0, 5, 10 in x: the level-2.5 line sits at x = 0.5.
    const raster = new Float64Array([0, 5, 10, 0, 5, 10]);
    const segments = marchingSquaresSegments(raster, 3, 2, 2.5);

    expect(segments).toHaveLength(1);
    const [x1, y1, x2, y2] = segments[0]!;
    expect(x1).toBeCloseTo(0.5);
    expect(x2).toBeCloseTo(0.5);
    expect(Math.min(y1, y2)).toBe(0);
    expect(Math.max(y1, y2)).toBe(1);
  });

  it("emits nothing when the level is outside the raster's range", () => {
    const raster = new Float64Array([0, 1, 0, 1]);
    expect(marchingSquaresSegments(raster, 2, 2, 5)).toHaveLength(0);
  });
});

describe("contourLevels / bluesColor", () => {
  it("places levels strictly inside the range", () => {
    expect(contourLevels(0, 10, 4)).toEqual([2, 4, 6, 8]);
    expect(contourLevels(3, 3, 4)).toEqual([]);
  });

  it("ramps from near-white to deep blue", () => {
    expect(bluesColor(0)).toBe("rgb(247, 251, 255)");
    expect(bluesColor(1)).toBe("rgb(8, 48, 107)");
    expect(bluesColor(0.5)).toMatch(/^rgb\(/u);
  });
});

describe("sweepCellObjective", () => {
  const distribution = (
    frameNumber: number,
    bins: readonly (readonly [number, number])[],
  ): MonteCarloUserDefinedMetricFrame => ({
    metricId: "m",
    label: "M",
    outputType: "distribution",
    frameNumber,
    time: frameNumber,
    bins,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount: 8,
    timeSampleCount: 8,
  });

  it("reads the mean of the metric's final distribution frame", () => {
    const frames = [
      distribution(0, [[100, 8]]),
      distribution(1, [
        [10, 4],
        [20, 4],
      ]),
    ];
    expect(sweepCellObjective(frames, "m")).toBe(15);
  });

  it("returns null when the metric never reported", () => {
    expect(sweepCellObjective([distribution(0, [[1, 8]])], "other")).toBeNull();
  });

  it("scans back past trailing sample-less frames to the last real one", () => {
    // A terminating net finishes its runs before maxTime, so its final
    // frames carry no samples; the value lives on the last sampled frame.
    const frames = [
      distribution(0, [[100, 8]]),
      distribution(1, [
        [10, 4],
        [20, 4],
      ]),
      distribution(2, []),
      distribution(3, []),
    ];
    expect(sweepCellObjective(frames, "m")).toBe(15);
  });

  it("scans back past a trailing null scalar frame", () => {
    const scalar = (
      frameNumber: number,
      frameValue: number | null,
    ): MonteCarloUserDefinedMetricFrame => ({
      metricId: "m",
      label: "M",
      outputType: "scalar",
      frameNumber,
      time: frameNumber,
      value: frameValue,
      frameValue,
      timeValue: null,
      runSampleCount: frameValue === null ? 0 : 8,
      timeSampleCount: frameValue === null ? 0 : 8,
      runAggregate: {
        count: 1,
        sum: frameValue ?? 0,
        min: frameValue,
        max: frameValue,
        last: frameValue,
      },
      aggregateRuns: "mean",
      aggregateTime: "none",
    });
    expect(sweepCellObjective([scalar(0, 42), scalar(1, null)], "m")).toBe(42);
  });
});
