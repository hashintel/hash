import { describe, expect, it } from "vitest";

import { AtlasTileCache } from "./atlas-tile-cache";

import type { AtlasTileCoordinate, DecodedAtlasTile } from "../atlas-client";

const hash = "11".repeat(32);

const tile = (
  coordinate: AtlasTileCoordinate,
  rowId: number,
): DecodedAtlasTile => ({
  bucketCounts: new Uint32Array([1]),
  byteLength: 176,
  complete: true,
  coordinate,
  deliveredCount: 1,
  generation: hash,
  manifestHash: hash,
  pointWeights: new Uint32Array([1]),
  positions: new Uint16Array([0, 0]),
  releaseReportHash: hash,
  rowIds: new Uint32Array([rowId]),
  storeSnapshotIdentity: hash,
  variant: 0,
  visibleSubtreeCount: 1,
});

describe("AtlasTileCache", () => {
  it("evicts the least-recently-used unprotected tile", () => {
    const cache = new AtlasTileCache(336);
    const root = tile({ z: 0, x: 0, y: 0 }, 1);
    const northwest = tile({ z: 1, x: 0, y: 0 }, 2);
    const northeast = tile({ z: 1, x: 1, y: 0 }, 3);

    cache.set(root, new Set());
    cache.set(northwest, new Set());
    cache.get("0/0/0");
    cache.set(northeast, new Set());

    expect(cache.has("0/0/0")).toBe(true);
    expect(cache.has("1/0/0")).toBe(false);
    expect(cache.has("1/1/0")).toBe(true);
  });

  it("allows a protected working set to exceed the byte target", () => {
    const cache = new AtlasTileCache(168);
    const root = tile({ z: 0, x: 0, y: 0 }, 1);
    const child = tile({ z: 1, x: 0, y: 0 }, 2);
    const protectedKeys = new Set(["0/0/0", "1/0/0"]);

    cache.set(root, protectedKeys);
    cache.set(child, protectedKeys);

    expect(cache.stats).toEqual({ byteSize: 336, tileCount: 2 });
  });

  it("clears all decoded storage", () => {
    const cache = new AtlasTileCache(168);
    cache.set(tile({ z: 0, x: 0, y: 0 }, 1), new Set());

    cache.clear();

    expect(cache.stats).toEqual({ byteSize: 0, tileCount: 0 });
  });
});
