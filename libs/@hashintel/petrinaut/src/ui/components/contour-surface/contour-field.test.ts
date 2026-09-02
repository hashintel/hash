import { describe, expect, it } from "vitest";

import {
  contourLevels,
  createIdwAccumulator,
  idwRaster,
  marchingSquaresSegments,
} from "./contour-field";

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

describe("createIdwAccumulator", () => {
  const samples = [
    { x: 0, y: 0, value: 1 },
    { x: 2, y: 2, value: 9 },
    { x: 1, y: 2, value: 4 },
  ];
  const size = { nx: 3, ny: 3, width: 9, height: 9 };

  it("matches idwRaster after folding samples incrementally", () => {
    const accumulator = createIdwAccumulator(size);
    accumulator.update(samples.slice(0, 1));
    accumulator.update(samples.slice(0, 2));
    const incremental = [...accumulator.update(samples)];
    expect(incremental).toEqual([...idwRaster({ samples, ...size })]);
  });

  it("bumps the version only when the raster changes", () => {
    const accumulator = createIdwAccumulator(size);
    accumulator.update(samples.slice(0, 2));
    const version = accumulator.version;
    accumulator.update(samples.slice(0, 2));
    expect(accumulator.version).toBe(version);
    accumulator.update(samples);
    expect(accumulator.version).toBe(version + 1);
  });

  it("refolds from scratch when the samples do not extend the previous list", () => {
    const accumulator = createIdwAccumulator(size);
    accumulator.update(samples);
    const restarted = [...accumulator.update(samples.slice(2))];
    expect(restarted).toEqual([
      ...idwRaster({ samples: samples.slice(2), ...size }),
    ]);
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

describe("contourLevels", () => {
  it("places levels strictly inside the range", () => {
    expect(contourLevels(0, 10, 4)).toEqual([2, 4, 6, 8]);
    expect(contourLevels(3, 3, 4)).toEqual([]);
  });
});
