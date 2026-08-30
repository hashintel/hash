import { describe, expect, it } from "vitest";

import { buildDensityGrid } from "./density-grid";

import type { DistributionColumn } from "./density-grid";

const column = (
  time: number,
  bins: (readonly [number, number])[],
): DistributionColumn => ({ time, bins });

describe("buildDensityGrid", () => {
  it("puts each bin's mass at its value's rows and normalizes to 1", () => {
    const grid = buildDensityGrid(
      [
        column(0, [
          [0, 10],
          [10, 30],
        ]),
      ],
      {
        rows: 11,
        transform: "linear",
        normalization: "column",
        smoothingSigma: 0,
        displayGamma: 1,
      },
    );
    expect(grid.rows).toBe(11);
    expect(grid.columns).toBe(1);
    expect(grid.densities[0]).toBeCloseTo(10 / 30);
    expect(grid.densities[10]).toBeCloseTo(1);
  });

  it("column normalization makes every column peak at 1, global keeps ratios", () => {
    // Values 0 and 3 land exactly on rows 0 and 3 of a 4-row grid.
    const columns = [column(0, [[0, 10]]), column(1, [[3, 100]])];
    const columnZeroPeak = 0; // row 0, column 0
    const columnOnePeak = 3 * 2 + 1; // row 3, column 1
    const perColumn = buildDensityGrid(columns, {
      rows: 4,
      transform: "linear",
      normalization: "column",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    expect(perColumn.densities[columnZeroPeak]).toBeCloseTo(1);
    expect(perColumn.densities[columnOnePeak]).toBeCloseTo(1);

    const global = buildDensityGrid(columns, {
      rows: 4,
      transform: "linear",
      normalization: "global",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    expect(global.densities[columnZeroPeak]).toBeCloseTo(0.1);
    expect(global.densities[columnOnePeak]).toBeCloseTo(1);
  });

  it("share normalization sums each column to 1, so a spread mode is lighter", () => {
    // Column 0 concentrates all runs in one value; column 1 spreads the
    // same runs over two values. Values 0 and 3 land exactly on rows.
    const columns = [
      column(0, [[0, 100]]),
      column(1, [
        [0, 50],
        [3, 50],
      ]),
    ];
    const grid = buildDensityGrid(columns, {
      rows: 4,
      transform: "linear",
      normalization: "share",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    expect(grid.densities[0]).toBeCloseTo(1); // concentrated mode
    expect(grid.densities[1]).toBeCloseTo(0.5); // spread mode, row 0
    expect(grid.densities[3 * 2 + 1]).toBeCloseTo(0.5); // spread mode, row 3
    for (const columnIndex of [0, 1]) {
      let sum = 0;
      for (let row = 0; row < 4; row++) {
        sum += grid.densities[row * 2 + columnIndex]!;
      }
      expect(sum).toBeCloseTo(1);
    }
  });

  it("display gamma lifts small densities without reordering", () => {
    const columns = [
      column(0, [
        [0, 50],
        [3, 50],
      ]),
    ];
    const grid = buildDensityGrid(columns, {
      rows: 4,
      transform: "linear",
      normalization: "share",
      smoothingSigma: 0,
      displayGamma: 0.5,
    });
    expect(grid.densities[0]).toBeCloseTo(Math.sqrt(0.5));
    expect(grid.densities[3]).toBeCloseTo(Math.sqrt(0.5));
    expect(grid.densities[1]).toBe(0); // zero stays zero
  });

  it("log transform compresses a heavy tail's dominance", () => {
    const columns = [
      column(0, [
        [0, 1_000],
        [9, 10],
      ]),
    ];
    const linear = buildDensityGrid(columns, {
      rows: 10,
      transform: "linear",
      normalization: "column",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    const log = buildDensityGrid(columns, {
      rows: 10,
      transform: "log",
      normalization: "column",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    expect(linear.densities[9]).toBeCloseTo(0.01);
    expect(log.densities[9]!).toBeGreaterThan(0.3);
  });

  it("equalize maps counts to their quantile", () => {
    const grid = buildDensityGrid(
      [
        column(0, [
          [0, 5],
          [5, 10],
          [9, 20],
        ]),
      ],
      {
        rows: 10,
        transform: "equalize",
        normalization: "column",
        smoothingSigma: 0,
        displayGamma: 1,
      },
    );
    expect(grid.densities[0]).toBeCloseTo(1 / 3);
    expect(grid.densities[5]).toBeCloseTo(2 / 3);
    expect(grid.densities[9]).toBeCloseTo(1);
  });

  it("smoothing conserves mass and spreads a spike to neighbours", () => {
    const sharp = buildDensityGrid([column(0, [[5, 100]])], {
      rows: 11,
      transform: "linear",
      normalization: "global",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    const smoothed = buildDensityGrid([column(0, [[5, 100]])], {
      rows: 11,
      transform: "linear",
      normalization: "global",
      smoothingSigma: 1,
      displayGamma: 1,
    });
    expect(sharp.densities[4]).toBe(0);
    expect(smoothed.densities[4]!).toBeGreaterThan(0);
    expect(smoothed.densities[5]!).toBeLessThan(1.0001);
  });

  it("keeps a degenerate single-value range drawable", () => {
    const grid = buildDensityGrid([column(0, [[7, 50]])], {
      rows: 8,
      transform: "linear",
      normalization: "column",
      smoothingSigma: 0,
      displayGamma: 1,
    });
    let total = 0;
    for (const density of grid.densities) {
      total += density;
    }
    expect(total).toBeGreaterThan(0);
    expect(grid.valueMax).toBeGreaterThan(grid.valueMin);
  });
});
