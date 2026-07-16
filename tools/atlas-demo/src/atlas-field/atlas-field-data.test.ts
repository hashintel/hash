import { describe, expect, it } from "vitest";

import {
  deriveAtlasFieldNormalization,
  packAtlasField,
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
  it("packs center-sampled positions, masses, and delivering zoom", () => {
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
});

describe("deriveAtlasFieldNormalization", () => {
  it("ignores void and non-finite readback samples", () => {
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

    expect(deriveAtlasFieldNormalization(samples)).toEqual({
      floor: 1,
      reliefNorm: Math.log(8),
    });
  });

  it("uses safe defaults for an empty field", () => {
    expect(
      deriveAtlasFieldNormalization(new Float32Array(128 * 128 * 4)),
    ).toEqual({ floor: 0.001, reliefNorm: 1 });
  });
});
