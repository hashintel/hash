import { describe, expect, it } from "vitest";

import { summarizeBinValues } from "../../shared/metric-frames";
import { buildHeatmapDensityGrid } from "./density-grid";

import type { HeatmapFrame } from "./density-grid";

const frame = (
  time: number,
  bins: (readonly [number, number])[],
  binExtent?: HeatmapFrame["binExtent"],
): HeatmapFrame => ({ time, bins, binExtent });

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
    // The transitional value 500 appears alone in its frame; it must get a
    // row of its own instead of splatting onto 0 and 1000.
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
    // The two-mode exact frame stays two modes.
    expect(grid.densities[0 * 2]).toBeCloseTo(1); // value 0, column 0
    expect(grid.densities[1 * 2]).toBe(0); // value 500, column 0
    expect(grid.densities[2 * 2]).toBeCloseTo(1); // value 1000, column 0
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

  it("keeps every bin when the lattice gap is below floating-point resolution", () => {
    // Two values one ulp apart force a lattice gap of ~2e-16, so an exact
    // bin's half-step extent vanishes against its own value; the count must
    // still land in the value's row rather than be dropped.
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 1],
          [Number.EPSILON, 1],
          [1, 1],
          [2, 1],
          [3, 1],
        ]),
      ],
      TALL_PLOT,
    )!;
    const rowOf = (value: number) =>
      Math.round(
        ((value - grid.valueMin) / (grid.valueMax - grid.valueMin)) *
          (grid.rows - 1),
      );
    // Row 0 holds two bins and normalizes to 1; the others hold one each.
    expect(grid.densities[rowOf(0)]).toBeCloseTo(1);
    for (const value of [1, 2, 3]) {
      expect(grid.densities[rowOf(value)]).toBeCloseTo(0.5);
    }
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

  it("builds from a summary computed elsewhere", () => {
    const frames = [frame(0, [[0, 10]]), frame(1, [[3, 100]])];
    const summary = summarizeBinValues(frames);
    const grid = buildHeatmapDensityGrid(frames, TALL_PLOT, summary)!;
    expect(grid).toEqual(buildHeatmapDensityGrid(frames, TALL_PLOT));
    expect(buildHeatmapDensityGrid(frames, TALL_PLOT, null)).toBeNull();
  });
});

describe("buildHeatmapDensityGrid with mixed lattices", () => {
  it("fills every row a wide bin spans instead of striping alternate rows", () => {
    // Frame 0 is the host's exact initial value; frame 1 is binned at a
    // stride of 2 (a windowed GPU histogram labels an even stride by its
    // lower count: bin 11 holds counts 11 and 12). The chart-wide gap is 1,
    // so the grid has a row per unit, and each stride-2 bin must cover both
    // of its rows evenly.
    const stride2 = { below: 0.5, above: 1.5 };
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [[10, 100]]),
        frame(
          1,
          [
            [11, 50],
            [13, 50],
            [15, 50],
          ],
          stride2,
        ),
      ],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(6); // values 10..15
    const column1 = (row: number) => grid.densities[row * 2 + 1]!;
    // Rows 11..15 are uniform, each fully inside one stride-2 bin (bin 15
    // reaches to 16, off the grid). Row 10, the exact frame's value, is a
    // count no stride-2 bin holds.
    for (const row of [1, 2, 3, 4, 5]) {
      expect(column1(row)).toBeCloseTo(1);
    }
    expect(column1(0)).toBe(0);
  });

  it("paints a width-binned frame from each bin's lower edge", () => {
    // Width binning labels a bin by its lower edge: bin 0 of width 2 holds
    // [0, 2). On a unit lattice whose rows are centered on 0 and 1 it covers
    // half of row 0's cell and all of row 1's (the rest is off the grid).
    const grid = buildHeatmapDensityGrid(
      [frame(0, [[1, 100]]), frame(1, [[0, 100]], { below: 0, above: 2 })],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(2); // values 0..1
    expect(grid.densities[0 * 2 + 1]).toBeCloseTo(0.5);
    expect(grid.densities[1 * 2 + 1]).toBeCloseTo(1);
  });

  it("keeps a bin exactly on the lattice in its own row", () => {
    const grid = buildHeatmapDensityGrid(
      [
        frame(0, [
          [0, 1],
          [1, 3],
          [2, 1],
        ]),
      ],
      TALL_PLOT,
    )!;
    expect(grid.rows).toBe(3);
    expect(grid.densities[0]).toBeCloseTo(1 / 3);
    expect(grid.densities[1]).toBeCloseTo(1);
    expect(grid.densities[2]).toBeCloseTo(1 / 3);
  });
});
