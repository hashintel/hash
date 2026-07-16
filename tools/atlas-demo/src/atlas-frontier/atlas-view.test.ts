import { describe, expect, it } from "vitest";

import { ATLAS_WORLD_SIZE } from "../atlas-client";
import {
  atlasFitZoom,
  atlasTargetTileZoom,
  atlasTileIntersectsBounds,
  atlasVisibleBounds,
  atlasViewBounds,
  selectAtlasViewTiles,
  type AtlasViewState,
} from "./atlas-view";

const fullView = (size = 1024): AtlasViewState => ({
  height: size,
  targetX: ATLAS_WORLD_SIZE / 2,
  targetY: ATLAS_WORLD_SIZE / 2,
  width: size,
  zoom: atlasFitZoom(size, size),
});

describe("Atlas view tile selection", () => {
  it("targets z2 for a fitted full-world view", () => {
    const view = fullView();

    expect(view.zoom).toBe(-6);
    expect(atlasTargetTileZoom(view)).toBe(2);
    expect(selectAtlasViewTiles(view).required).toHaveLength(21);
  });

  it("advances one tile level per camera zoom octave", () => {
    const view = fullView();
    expect(atlasTargetTileZoom({ ...view, zoom: view.zoom + 1 })).toBe(3);
    expect(atlasTargetTileZoom({ ...view, zoom: view.zoom + 5.8 })).toBe(7);
  });

  it("keeps overscanned bounds inside the native world", () => {
    const view = {
      ...fullView(),
      targetX: 0,
      targetY: ATLAS_WORLD_SIZE,
    };

    expect(atlasViewBounds(view)).toEqual({
      maximumX: 49_152,
      maximumY: ATLAS_WORLD_SIZE,
      minimumX: 0,
      minimumY: 16_384,
    });
    expect(atlasVisibleBounds(view)).toEqual({
      maximumX: 32_768,
      maximumY: ATLAS_WORLD_SIZE,
      minimumX: 0,
      minimumY: 32_768,
    });
  });

  it("keeps prefetch padding out of the active render bounds", () => {
    const selection = selectAtlasViewTiles({
      height: 256,
      targetX: 43_008,
      targetY: 43_008,
      width: 256,
      zoom: -4,
    });

    expect(selection.bounds).toEqual({
      maximumX: 45_056,
      maximumY: 45_056,
      minimumX: 40_960,
      minimumY: 40_960,
    });
    expect(selection.requestBounds).toEqual({
      maximumX: 46_080,
      maximumY: 46_080,
      minimumX: 39_936,
      minimumY: 39_936,
    });
  });

  it("returns root-first ancestors for the visible region", () => {
    const view = {
      ...fullView(),
      height: 512,
      targetX: 8_192,
      targetY: 8_192,
      width: 512,
      zoom: -4,
    };
    const selection = selectAtlasViewTiles(view);

    expect(selection.required[0]).toEqual({ z: 0, x: 0, y: 0 });
    expect(selection.required.every(({ z }) => z <= selection.targetZoom)).toBe(
      true,
    );
    expect(selection.requiredKeys.size).toBe(selection.required.length);
  });

  it("uses half-open intersection at exact tile boundaries", () => {
    expect(
      atlasTileIntersectsBounds(
        { z: 1, x: 0, y: 0 },
        {
          maximumX: ATLAS_WORLD_SIZE,
          maximumY: ATLAS_WORLD_SIZE / 2,
          minimumX: ATLAS_WORLD_SIZE / 2,
          minimumY: 0,
        },
      ),
    ).toBe(false);
    expect(
      atlasTileIntersectsBounds(
        { z: 1, x: 1, y: 0 },
        {
          maximumX: ATLAS_WORLD_SIZE,
          maximumY: ATLAS_WORLD_SIZE / 2,
          minimumX: ATLAS_WORLD_SIZE / 2,
          minimumY: 0,
        },
      ),
    ).toBe(true);
  });
});
