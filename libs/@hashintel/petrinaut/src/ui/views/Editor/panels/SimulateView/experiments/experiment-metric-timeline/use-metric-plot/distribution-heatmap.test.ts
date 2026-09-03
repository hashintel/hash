import { describe, expect, it } from "vitest";

import {
  MAGMA_STOPS,
  rampLut,
  rasterizeNormalized,
} from "../../../../../../../shared/color-ramp";
import { heatmapAlpha } from "./distribution-heatmap";
import { buildHeatmapDensityGrid } from "./distribution-heatmap/density-grid";

describe("heatmap raster", () => {
  it("keeps zero density transparent and floors every other alpha", () => {
    const lut = rampLut(MAGMA_STOPS, heatmapAlpha);
    expect(lut[3]).toBe(0); // alpha of density 0
    expect(lut[1 * 4 + 3]).toBeGreaterThanOrEqual(Math.round(0.15 * 255));
    expect(lut[255 * 4 + 3]).toBe(255);
  });

  it("puts grid row 0 (the lowest value) at the image bottom", () => {
    const grid = buildHeatmapDensityGrid(
      [
        {
          time: 0,
          bins: [
            [0, 1],
            [1, 3],
          ],
        },
      ],
      4_000,
    )!;
    expect(grid.rows).toBe(2);
    const pixels = rasterizeNormalized(
      grid.densities,
      { columns: grid.columns, rows: grid.rows, flipY: true },
      rampLut(MAGMA_STOPS, heatmapAlpha),
    );
    // Image row 0 (top) is grid row 1, the column's densest cell.
    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBeLessThan(255);
    expect(pixels[7]).toBeGreaterThan(0);
  });
});
