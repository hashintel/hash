import { describe, expect, it } from "vitest";

import {
  buildHeatmapDensityGrid,
  magmaLut,
  rasterizeHeatmap,
} from "./distribution-heatmap";

import type { HeatmapFrame } from "./distribution-heatmap";

const frame = (
  time: number,
  bins: (readonly [number, number])[],
): HeatmapFrame => ({ time, bins });

/** Tall enough that the pixel cap never constrains the lattice. */
const TALL_PLOT = 4_000;

describe("buildHeatmapDensityGrid", () => {
  it("draws a histogram at its own resolution, normalized per column", () => {
    // Values 0 and 10 with a gap of 10: a two-row grid, not thin stripes.
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 10],
          [10, 30],
        ]),
      ],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(2);
    expect(grid.densities[0]).toBeCloseTo(10 / 30);
    expect(grid.densities[1]).toBeCloseTo(1);
  });

  it("normalizes every column against its own maximum", () => {
    // Single-bin frames: bin spacing only shows across frames (values 0, 3).
    const grid = buildHeatmapDensityGrid(
      [frame(0, [[0, 10]]), frame(1, [[3, 100]])],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(2);
    expect(grid.densities[0]).toBeCloseTo(1); // row 0, column 0
    expect(grid.densities[1 * 2 + 1]).toBeCloseTo(1); // row 1, column 1
  });

  it("resolves values that never share a frame with a near neighbour", () => {
    // The transitional value 500 appears alone in its frame; the lattice
    // must still give it a row of its own instead of splatting it onto
    // 0 and 1000 (values no run in that frame ever had).
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 100],
          [1_000, 100],
        ]),
        frame(1, [[500, 200]]),
      ],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(3);
    expect(grid.densities[0 * 2 + 1]).toBe(0); // value 0, column 1
    expect(grid.densities[1 * 2 + 1]).toBeCloseTo(1); // value 500, column 1
    expect(grid.densities[2 * 2 + 1]).toBe(0); // value 1000, column 1
  });

  it("caps the grid at the plot's pixel resolution", () => {
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 1],
          [1, 1],
          [1_000, 1],
        ]),
      ],
      440,
    )!;
    expect(grid.rows).toBe(220); // 440 device px / 2, not 1001 lattice rows
  });

  it("returns null without bins and pads a single-value range", () => {
    expect(buildHeatmapDensityGrid([frame(0, [])], TALL_PLOT)).toBeNull();

    const degenerate = buildHeatmapDensityGrid(
      [frame(0, [[7, 50]])],
      TALL_PLOT,
    )!;
    expect(degenerate.rows).toBe(1);
    expect(degenerate.valueMax).toBeGreaterThan(degenerate.valueMin);
    let total = 0;
    for (const density of degenerate.densities) {
      total += density;
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe("rasterizeHeatmap", () => {
  it("keeps zero density transparent and puts row 0 at the image bottom", () => {
    const lut = magmaLut();
    expect(lut[3]).toBe(0); // alpha of density 0

    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 1],
          [1, 1],
        ]),
      ],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(2);
    const pixels = rasterizeHeatmap(grid, lut);
    // Both rows tie the column maximum, so both pixels are fully dense;
    // image row 0 (top) is grid row 1 (valueMax).
    expect(pixels[3]).toBe(255); // top pixel alpha
    expect(pixels[7]).toBe(255); // bottom pixel alpha
  });
});
