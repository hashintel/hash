import { describe, expect, it } from "vitest";

import {
  atlasFieldBounds,
  deriveAtlasFieldExposure,
  packAtlasField,
  packAtlasMarks,
} from "./atlas-field-data";

import type { DecodedAtlasTile } from "../atlas-client";

const hash = "11".repeat(32);

const tile = (
  rowIds: readonly number[],
  positions: readonly number[],
): DecodedAtlasTile => ({
  byteLength: 160 + rowIds.length * 8,
  complete: false,
  coordinate: { z: 2, x: 0, y: 0 },
  deliveredCount: rowIds.length,
  generation: hash,
  manifestHash: hash,
  positions: new Uint16Array(positions),
  releaseReportHash: hash,
  rowIds: new Uint32Array(rowIds),
  storeSnapshotIdentity: hash,
  variant: 0,
  visibleSubtreeCount: rowIds.length * 5,
});

describe("packAtlasField", () => {
  it("packs position, mass, and delivery attributes", () => {
    const packed = packAtlasField([
      {
        massPerPoint: 5,
        tile: tile([10, 11], [100, 200, 300, 400]),
      },
    ]);

    expect(packed.instanceCount).toBe(2);
    expect([...packed.positions]).toEqual([100.5, 200.5, 300.5, 400.5]);
    expect([...packed.masses]).toEqual([5, 5]);
    expect([...packed.tileZooms]).toEqual([2, 2]);
  });

  it("derives a tight extent from center-sampled representatives", () => {
    expect(
      atlasFieldBounds([
        {
          massPerPoint: 5,
          tile: tile([10, 11], [100, 400, 300, 200]),
        },
      ]),
    ).toEqual({
      maximumX: 300.5,
      maximumY: 400.5,
      minimumX: 100.5,
      minimumY: 200.5,
    });
    expect(atlasFieldBounds([])).toBeUndefined();
  });

  it("rejects a repeated row across active frontier cells", () => {
    const first = tile([10], [100, 200]);
    const second = {
      ...tile([10], [30_000, 200]),
      coordinate: { z: 2, x: 1, y: 0 },
    };

    expect(() =>
      packAtlasField([
        { massPerPoint: 1, tile: first },
        { massPerPoint: 1, tile: second },
      ]),
    ).toThrow(/repeats generation row 10/u);
  });

  it("drops a budget-truncated trailing bucket instead of splatting its Z-prefix", () => {
    // Morton keys decrease at index 4, so indices 4-5 form the truncated
    // final bucket of this incomplete delivery.
    const truncated = {
      ...tile(
        [10, 11, 12, 13, 14, 15],
        [0, 0, 100, 100, 200, 200, 300, 300, 50, 50, 150, 150],
      ),
      visibleSubtreeCount: 60,
    };

    const packed = packAtlasField([{ massPerPoint: 15, tile: truncated }]);

    expect(packed.instanceCount).toBe(4);
    expect([...packed.positions]).toEqual([
      0.5, 0.5, 100.5, 100.5, 200.5, 200.5, 300.5, 300.5,
    ]);
    expect([...packed.masses]).toEqual([15, 15, 15, 15]);
  });
});

describe("packAtlasMarks", () => {
  it("packs stable row, position, and future color attributes", () => {
    const packed = packAtlasMarks(
      [
        {
          massPerPoint: 5,
          tile: tile([10, 11], [100, 200, 300, 400]),
        },
      ],
      (rowId) => (rowId === 10 ? [240, 120, 80] : undefined),
    );

    expect(packed.instanceCount).toBe(2);
    expect([...packed.rowIds]).toEqual([10, 11]);
    expect([...packed.positions]).toEqual([100.5, 200.5, 300.5, 400.5]);
    expect(packed.markColors.slice(0, 3)).toEqual(
      new Uint8Array([240, 120, 80]),
    );
    expect(packed.markColors.slice(4, 7)).toEqual(
      new Uint8Array([190, 194, 196]),
    );
    expect(packed.markColors[3]).toBeGreaterThan(0);
    expect(packed.markColors[3]).toBe(packed.markColors[7]);
  });

  it("balances independently capped tile prefixes by represented mass", () => {
    const denseTile = {
      ...tile([10, 11, 12, 13], [100, 200, 110, 210, 120, 220, 130, 230]),
      visibleSubtreeCount: 40,
    };
    const sparseTile = {
      ...tile([20, 21, 22, 23], [300, 400, 310, 410, 320, 420, 330, 430]),
      coordinate: { z: 2, x: 1, y: 0 },
      visibleSubtreeCount: 4,
    };

    const packed = packAtlasMarks([
      { massPerPoint: 10, tile: denseTile },
      { massPerPoint: 1, tile: sparseTile },
    ]);

    expect([...packed.rowIds]).toEqual([10, 11, 12, 13, 20]);
  });

  it("stride-samples the bucket where the mark cap lands instead of cutting a prefix", () => {
    const denseTile = {
      ...tile([1], [40_000, 40_000]),
      visibleSubtreeCount: 20,
    };
    const sparseTile = {
      ...tile([20, 21, 22, 23], [0, 0, 10, 10, 20, 20, 30, 30]),
      coordinate: { z: 2, x: 1, y: 0 },
      visibleSubtreeCount: 40,
    };

    const packed = packAtlasMarks([
      { massPerPoint: 20, tile: denseTile },
      { massPerPoint: 10, tile: sparseTile },
    ]);

    // The sparse tile is capped to ceil(40 / 20) = 2 marks from one
    // four-point bucket: a prefix would return rows 20 and 21, the stride
    // spreads the picks across the bucket's Morton range instead.
    expect([...packed.rowIds]).toEqual([1, 20, 22]);
  });

  it("keeps surviving row marks stable when refinement adds rows", () => {
    const parent = packAtlasMarks([
      {
        massPerPoint: 5,
        tile: tile([10], [100, 200]),
      },
    ]);
    const refined = packAtlasMarks([
      {
        massPerPoint: 2,
        tile: {
          ...tile([10, 12], [100, 200, 300, 400]),
          coordinate: { z: 3, x: 0, y: 0 },
        },
      },
    ]);

    expect([...refined.rowIds]).toEqual([10, 12]);
    expect(refined.positions.slice(0, 2)).toEqual(parent.positions.slice(0, 2));
    expect(refined.markColors.slice(0, 3)).toEqual(
      parent.markColors.slice(0, 3),
    );
  });
});

describe("deriveAtlasFieldExposure", () => {
  it("normalizes against positive density without turning zero into a cutoff", () => {
    const samples = new Float32Array([
      0,
      0,
      0,
      1,
      Number.NaN,
      0,
      0,
      1,
      2,
      0,
      0,
      1,
      8,
      0,
      0,
      1,
      32,
      0,
      0,
      1,
    ]);

    expect(deriveAtlasFieldExposure(samples)).toEqual({
      densityScale: 1 / 8,
    });
  });

  it("uses safe defaults for an empty field", () => {
    expect(deriveAtlasFieldExposure(new Float32Array(128 * 128 * 4))).toEqual({
      densityScale: 1,
    });
  });
});
