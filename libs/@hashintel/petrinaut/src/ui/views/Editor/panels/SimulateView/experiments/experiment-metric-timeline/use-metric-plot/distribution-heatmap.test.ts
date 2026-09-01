import { describe, expect, it } from "vitest";

import {
  blendHeatmapGrids,
  buildHeatmapDensityGrid,
  easeHeatmapDisplay,
  HEATMAP_SETTLE_STEPS,
  magmaLut,
  rasterizeHeatmap,
  settleHeatmapDisplay,
} from "./distribution-heatmap";

import type { HeatmapDensityGrid, HeatmapFrame } from "./distribution-heatmap";

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
    // And the two-mode exact frame stays two modes: nothing is inferred
    // from the gap between the values it happens to occupy.
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
});

describe("buildHeatmapDensityGrid with mixed lattices", () => {
  it("fills every row a wide bin spans instead of striping alternate rows", () => {
    // Frame 0 is the host's exact initial value; frame 1 is binned at a
    // stride of 2 (a windowed GPU histogram, which labels an even stride by
    // its lower count: bin 11 holds counts 11 and 12). The chart-wide gap
    // is 1, so the grid has a row per unit — and each stride-2 bin must
    // cover both of its rows evenly, not light one and leave the next empty.
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
    // Rows 11..15 are uniform — each fully inside one stride-2 bin (bin 15
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
    // half of row 0's cell and all of row 1's (the rest is off the grid) —
    // it reaches up from its label, not down to -1.
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

const twoRows = (
  columns: number[][],
  valueMin = 0,
  valueMax = 1,
): HeatmapDensityGrid => {
  const cols = columns.length;
  const densities = new Float32Array(2 * cols);
  for (const [column, [low, high]] of columns.entries()) {
    densities[0 * cols + column] = low!;
    densities[1 * cols + column] = high!;
  }
  return { columns: cols, rows: 2, densities, valueMin, valueMax };
};

describe("blendHeatmapGrids", () => {
  it("shows the next grid outright without a previous one", () => {
    const next = twoRows([[1, 0]]);
    expect(blendHeatmapGrids(null, next)).toBe(next);
  });

  it("mixes shared columns and takes appended columns as they are", () => {
    const previous = twoRows([[1, 0]]);
    const next = twoRows([
      [0, 1],
      [0.2, 0.8],
    ]);
    const blended = blendHeatmapGrids(previous, next, 0.5);
    // Column 0 existed before: halfway between the two pictures.
    expect(blended.densities[0]).toBeCloseTo(0.5);
    expect(blended.densities[2]).toBeCloseTo(0.5);
    // Column 1 is new: exactly the next grid.
    expect(blended.densities[1]).toBeCloseTo(0.2);
    expect(blended.densities[3]).toBeCloseTo(0.8);
  });

  it("resamples a previous grid whose lattice moved", () => {
    // Previous covers values 0..1 (rows at 0 and 1); next covers 0..2 with
    // rows at 0, 1, 2. Row 2 lies outside the previous range: nothing to mix.
    const previous = twoRows([[1, 0]], 0, 1);
    const next: HeatmapDensityGrid = {
      columns: 1,
      rows: 3,
      densities: new Float32Array([0, 0, 1]),
      valueMin: 0,
      valueMax: 2,
    };
    const blended = blendHeatmapGrids(previous, next, 0.5);
    expect(blended.densities[0]).toBeCloseTo(0.5); // previous 1 at value 0
    expect(blended.densities[1]).toBeCloseTo(0); // previous 0 at value 1
    expect(blended.densities[2]).toBeCloseTo(0.5); // no previous, next only
  });

  it("samples a single-row grid at its value, not its padded edge", () => {
    // Previous has rows at 5..9 with all the density at 7; next collapsed
    // to the single value 7 (padded to 6.5..7.5). The previous density at
    // 7 is 1, so the blend stays 1 — sampling at the padded edge 6.5 would
    // read halfway between rows 6 and 7 instead.
    const previous: HeatmapDensityGrid = {
      columns: 1,
      rows: 5,
      densities: new Float32Array([0, 0, 1, 0, 0]),
      valueMin: 5,
      valueMax: 9,
    };
    const next: HeatmapDensityGrid = {
      columns: 1,
      rows: 1,
      densities: new Float32Array([1]),
      valueMin: 6.5,
      valueMax: 7.5,
    };
    expect(blendHeatmapGrids(previous, next, 0.5).densities[0]).toBeCloseTo(1);
  });
});

describe("heatmap display easing", () => {
  it("paints exactly when there is nothing to ease from", () => {
    const target = twoRows([[0, 1]]);
    const display = easeHeatmapDisplay(null, target);
    expect(display.grid).toBe(target);
    expect(display.stepsLeft).toBe(0);
  });

  it("eases in from the shown grid and settles to the exact target", () => {
    const shown = easeHeatmapDisplay(null, twoRows([[1, 0]]));
    const target = twoRows([[0, 1]]);
    let display = easeHeatmapDisplay(shown, target);
    expect(display.grid.densities[1]).toBeCloseTo(0.5);
    expect(display.stepsLeft).toBe(HEATMAP_SETTLE_STEPS);

    // Each settle step halves what remains of the old picture...
    display = settleHeatmapDisplay(display);
    expect(display.grid.densities[1]).toBeCloseTo(0.75);
    display = settleHeatmapDisplay(display);
    expect(display.grid.densities[1]).toBeCloseTo(0.875);
    // ...and the last one is the target itself, not another half-step.
    display = settleHeatmapDisplay(display);
    expect(display.grid).toBe(target);
    expect(display.stepsLeft).toBe(0);
    // Settling a settled display is a no-op.
    expect(settleHeatmapDisplay(display).grid).toBe(target);
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
