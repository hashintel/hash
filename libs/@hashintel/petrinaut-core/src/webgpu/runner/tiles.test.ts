import { describe, expect, it } from "vitest";

import {
  dispatchChunkFrames,
  GPU_PREVIEW_RUNS,
  planTiles,
  runsPerTile,
} from "./tiles";

describe("planTiles", () => {
  it("opens a previewed experiment with a preview tile, then full tiles", () => {
    expect(planTiles(10_000, 4_000, GPU_PREVIEW_RUNS)).toEqual([
      { firstRun: 0, runCount: 128 },
      { firstRun: 128, runCount: 4_000 },
      { firstRun: 4_128, runCount: 4_000 },
      { firstRun: 8_128, runCount: 1_872 },
    ]);
  });

  it("covers every run exactly once, preview or not", () => {
    for (const preview of [null, GPU_PREVIEW_RUNS]) {
      const tiles = planTiles(9_731, 1_000, preview);
      let expected = 0;
      for (const tile of tiles) {
        expect(tile.firstRun).toBe(expected);
        expected += tile.runCount;
      }
      expect(expected).toBe(9_731);
    }
  });

  it("skips the preview when none is asked for or the run count is small", () => {
    expect(planTiles(10_000, 4_000, null)).toEqual([
      { firstRun: 0, runCount: 4_000 },
      { firstRun: 4_000, runCount: 4_000 },
      { firstRun: 8_000, runCount: 2_000 },
    ]);
    // 2× the preview or fewer: the split would only add a tile boundary.
    expect(planTiles(256, 4_000, 128)).toEqual([
      { firstRun: 0, runCount: 256 },
    ]);
    expect(planTiles(257, 4_000, 128)).toEqual([
      { firstRun: 0, runCount: 128 },
      { firstRun: 128, runCount: 129 },
    ]);
  });

  it("skips the preview when a tile is no bigger anyway", () => {
    expect(planTiles(1_000, 100, 128)).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        firstRun: index * 100,
        runCount: 100,
      })),
    );
  });
});

describe("runsPerTile", () => {
  const LIMITS = {
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxBufferSize: 256 * 1024 * 1024,
    maxComputeWorkgroupsPerDimension: 65535,
  };

  it("takes the smaller of the two buffer limits, not just the binding size", () => {
    // Checking only `maxStorageBufferBindingSize` would size tiles the
    // allocation then rejects as a raw WebGPU validation error.
    const cappedAllocation = {
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
      maxComputeWorkgroupsPerDimension: 10_000_000,
    };

    expect(runsPerTile({ bytesPerRun: 1024, limits: cappedAllocation })).toBe(
      Math.floor((256 * 1024 * 1024) / 1024),
    );
  });

  it("sizes a tile by memory when state is the binding constraint", () => {
    // floor(134217728 / 16384) = 8192 runs of 16 KB state each.
    expect(runsPerTile({ bytesPerRun: 16384, limits: LIMITS })).toBe(8192);
  });

  it("sizes a tile by dispatch width when runs are small", () => {
    // 4-byte runs would fit ~33.5M in memory, but one dispatch caps at
    // 65535 workgroups × 256 invocations = ~16.8M.
    expect(runsPerTile({ bytesPerRun: 4, limits: LIMITS })).toBe(65535 * 256);
  });

  it("does not divide by zero when a run holds no state", () => {
    expect(runsPerTile({ bytesPerRun: 0, limits: LIMITS })).toBe(65535 * 256);
  });
});

describe("dispatchChunkFrames", () => {
  it("ramps short chunks first, then holds the configured size", () => {
    expect(dispatchChunkFrames(1_000, 300)).toEqual([
      32, 64, 128, 256, 300, 220,
    ]);
  });

  it("never exceeds the frame limit or the configured chunk", () => {
    expect(dispatchChunkFrames(40, 300)).toEqual([32, 8]);
    expect(dispatchChunkFrames(10, 4)).toEqual([4, 4, 2]);
  });

  it("covers exactly the frame limit", () => {
    for (const [limit, per] of [
      [1, 300],
      [600, 300],
      [601, 300],
      [299, 300],
    ] as const) {
      const total = dispatchChunkFrames(limit, per).reduce(
        (sum, chunk) => sum + chunk,
        0,
      );
      expect(total).toBe(limit);
    }
  });
});
