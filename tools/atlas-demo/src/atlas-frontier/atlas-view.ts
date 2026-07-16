/**
 * Converts a deck.gl orthographic camera into the bounded quadtree working set.
 *
 * A full-world view targets z2. Each camera zoom octave advances one spatial
 * tile level, keeping the number of visible tile requests approximately
 * constant while improving local detail.
 */

import {
  ATLAS_MAX_TILE_ZOOM,
  ATLAS_WORLD_SIZE,
  atlasTileBounds,
  atlasTileKey,
  type AtlasTileBounds,
  type AtlasTileCoordinate,
} from "../atlas-client";

const initialDetailZoom = 2;
const minimumOverscanPixels = 64;
const maximumOverscanPixels = 384;
const overscanViewportFraction = 0.25;

/** Camera values required to select Atlas tiles. */
export interface AtlasViewState {
  readonly height: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly width: number;
  readonly zoom: number;
}

/** Quadtree requirements derived from one camera state. */
export interface AtlasViewSelection {
  /** Exact camera bounds used to choose the active render frontier. */
  readonly bounds: AtlasTileBounds;
  /** Overscanned bounds used only to prefetch nearby tiles. */
  readonly requestBounds: AtlasTileBounds;
  readonly required: readonly AtlasTileCoordinate[];
  readonly requiredKeys: ReadonlySet<string>;
  readonly targetZoom: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const validateView = (view: AtlasViewState): void => {
  if (
    !Number.isFinite(view.width) ||
    !Number.isFinite(view.height) ||
    view.width <= 0 ||
    view.height <= 0
  ) {
    throw new RangeError("Atlas viewport dimensions must be positive");
  }
  if (
    !Number.isFinite(view.zoom) ||
    !Number.isFinite(view.targetX) ||
    !Number.isFinite(view.targetY)
  ) {
    throw new RangeError("Atlas viewport camera values must be finite");
  }
};

/** Returns the camera zoom that fits the complete Atlas square. */
export const atlasFitZoom = (width: number, height: number): number => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Atlas fit dimensions must be positive");
  }
  return Math.log2(Math.min(width, height) / ATLAS_WORLD_SIZE);
};

/** Returns the tile zoom selected for a camera and canvas size. */
export const atlasTargetTileZoom = (view: AtlasViewState): number => {
  validateView(view);
  const revealZoom = view.zoom - atlasFitZoom(view.width, view.height);
  return clamp(
    Math.floor(revealZoom) + initialDetailZoom,
    0,
    ATLAS_MAX_TILE_ZOOM,
  );
};

const viewBounds = (
  view: AtlasViewState,
  paddingPixels: number,
): AtlasTileBounds => {
  validateView(view);
  const pixelsPerWorldUnit = 2 ** view.zoom;
  const halfWidth = (view.width / 2 + paddingPixels) / pixelsPerWorldUnit;
  const halfHeight = (view.height / 2 + paddingPixels) / pixelsPerWorldUnit;
  return {
    maximumX: clamp(view.targetX + halfWidth, 0, ATLAS_WORLD_SIZE),
    maximumY: clamp(view.targetY + halfHeight, 0, ATLAS_WORLD_SIZE),
    minimumX: clamp(view.targetX - halfWidth, 0, ATLAS_WORLD_SIZE),
    minimumY: clamp(view.targetY - halfHeight, 0, ATLAS_WORLD_SIZE),
  };
};

/** Returns the exact world bounds visible through the camera. */
export const atlasVisibleBounds = (view: AtlasViewState): AtlasTileBounds =>
  viewBounds(view, 0);

/** Returns padded request bounds used to warm tiles before they become visible. */
export const atlasViewBounds = (view: AtlasViewState): AtlasTileBounds => {
  const overscanPixels = clamp(
    Math.min(view.width, view.height) * overscanViewportFraction,
    minimumOverscanPixels,
    maximumOverscanPixels,
  );
  return viewBounds(view, overscanPixels);
};

/** Returns whether a tile intersects the selected half-open world bounds. */
export const atlasTileIntersectsBounds = (
  coordinate: AtlasTileCoordinate,
  bounds: AtlasTileBounds,
): boolean => {
  const tile = atlasTileBounds(coordinate);
  return (
    tile.minimumX < bounds.maximumX &&
    tile.maximumX > bounds.minimumX &&
    tile.minimumY < bounds.maximumY &&
    tile.maximumY > bounds.minimumY
  );
};

const tilesAtZoom = (
  zoom: number,
  bounds: AtlasTileBounds,
): AtlasTileCoordinate[] => {
  if (
    bounds.minimumX >= bounds.maximumX ||
    bounds.minimumY >= bounds.maximumY
  ) {
    return [];
  }

  const axisCells = 2 ** zoom;
  const tileWidth = ATLAS_WORLD_SIZE / axisCells;
  const minimumX = clamp(
    Math.floor(bounds.minimumX / tileWidth),
    0,
    axisCells - 1,
  );
  const minimumY = clamp(
    Math.floor(bounds.minimumY / tileWidth),
    0,
    axisCells - 1,
  );
  const maximumX = clamp(
    Math.ceil(bounds.maximumX / tileWidth) - 1,
    0,
    axisCells - 1,
  );
  const maximumY = clamp(
    Math.ceil(bounds.maximumY / tileWidth) - 1,
    0,
    axisCells - 1,
  );
  const coordinates: AtlasTileCoordinate[] = [];
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      coordinates.push({ z: zoom, x, y });
    }
  }
  return coordinates;
};

const distanceToTarget = (
  coordinate: AtlasTileCoordinate,
  view: AtlasViewState,
): number => {
  const bounds = atlasTileBounds(coordinate);
  const centerX = (bounds.minimumX + bounds.maximumX) / 2;
  const centerY = (bounds.minimumY + bounds.maximumY) / 2;
  return Math.hypot(centerX - view.targetX, centerY - view.targetY);
};

/**
 * Selects root-first tile requirements for the visible camera region.
 *
 * Every ancestor level is included so a parent can remain active until its
 * visible children are ready.
 */
export const selectAtlasViewTiles = (
  view: AtlasViewState,
): AtlasViewSelection => {
  const bounds = atlasVisibleBounds(view);
  const requestBounds = atlasViewBounds(view);
  const targetZoom = atlasTargetTileZoom(view);
  const required: AtlasTileCoordinate[] = [{ z: 0, x: 0, y: 0 }];

  for (let zoom = 1; zoom <= targetZoom; zoom += 1) {
    const level = tilesAtZoom(zoom, requestBounds);
    level.sort(
      (left, right) =>
        distanceToTarget(left, view) - distanceToTarget(right, view),
    );
    required.push(...level);
  }

  return {
    bounds,
    requestBounds,
    required,
    requiredKeys: new Set(
      required.map((coordinate) => atlasTileKey(coordinate)),
    ),
    targetZoom,
  };
};
