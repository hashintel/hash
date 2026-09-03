import { describe, expect, it } from "vitest";

import {
  blendHeatmapGrids,
  easeHeatmapDisplay,
  HEATMAP_SETTLE_STEPS,
  settleHeatmapDisplay,
} from "./display-easing";

import type { HeatmapDensityGrid } from "./density-grid";

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
    // 7 is 1, so the blend stays 1; sampling at the padded edge 6.5 would
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
