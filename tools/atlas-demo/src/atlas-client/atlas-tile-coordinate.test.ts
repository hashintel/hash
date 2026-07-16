import { describe, expect, it } from "vitest";

import {
  ATLAS_WORLD_SIZE,
  atlasTileBounds,
  atlasTileChildren,
  atlasTileKey,
  validateAtlasTileCoordinate,
} from "./atlas-tile-coordinate";

describe("Atlas tile coordinates", () => {
  it("maps the root to the complete native coordinate square", () => {
    expect(atlasTileBounds({ z: 0, x: 0, y: 0 })).toEqual({
      maximumX: ATLAS_WORLD_SIZE,
      maximumY: ATLAS_WORLD_SIZE,
      minimumX: 0,
      minimumY: 0,
    });
  });

  it("computes exact half-open quadrant bounds", () => {
    expect(atlasTileBounds({ z: 2, x: 1, y: 2 })).toEqual({
      maximumX: 32_768,
      maximumY: 49_152,
      minimumX: 16_384,
      minimumY: 32_768,
    });
  });

  it("returns children in stable Morton quadrant order", () => {
    expect(atlasTileChildren({ z: 3, x: 2, y: 5 })).toEqual([
      { z: 4, x: 4, y: 10 },
      { z: 4, x: 5, y: 10 },
      { z: 4, x: 4, y: 11 },
      { z: 4, x: 5, y: 11 },
    ]);
  });

  it("returns no children at the maximum wire depth", () => {
    expect(atlasTileChildren({ z: 16, x: 12, y: 34 })).toEqual([]);
  });

  it("rejects invalid zooms and quadrants", () => {
    expect(() => validateAtlasTileCoordinate({ z: 17, x: 0, y: 0 })).toThrow(
      /zoom/u,
    );
    expect(() => validateAtlasTileCoordinate({ z: 4, x: 16, y: 0 })).toThrow(
      /tile x/u,
    );
    expect(() => validateAtlasTileCoordinate({ z: 4, x: 0, y: -1 })).toThrow(
      /tile y/u,
    );
  });

  it("formats a stable cache key", () => {
    expect(atlasTileKey({ z: 4, x: 3, y: 9 })).toBe("4/3/9");
  });
});
