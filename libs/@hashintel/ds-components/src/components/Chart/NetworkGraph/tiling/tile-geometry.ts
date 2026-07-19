/**
 * Pure viewport↔tile geometry for the Atlas tiling layer.
 *
 * Turns a world-space rectangle plus a quadtree depth into the tiles that cover
 * it ({@link requiredTiles}), and measures how far a tile sits from a viewport
 * ({@link tileDistance}). Shared, with no React or cache dependency, by the load
 * path, the cache's eviction ordering, and the prefetch predictor — so it is a
 * leaf module (breaking what would otherwise be an import cycle).
 *
 * World space is the Atlas global 16-bit axis, `[0, {@link WORLD_SIZE})` on each
 * axis. At quadtree depth `z` the world is a `2 ** z` by `2 ** z` grid of tiles,
 * each spanning `WORLD_SIZE / 2 ** z` units.
 */

import {
  ATLAS_TILE_AXIS_SIZE,
  ATLAS_TILE_MAX_ZOOM,
  atlasTileBounds,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";

/** Width and height of the world axis the grid tiles over (`65536`). */
export const WORLD_SIZE = ATLAS_TILE_AXIS_SIZE;

/**
 * Cap on tiles enumerated per depth along each axis. Bounds the work when a
 * viewport rectangle and zoom disagree (e.g. the whole world at a deep zoom),
 * which would otherwise enumerate an entire grid level.
 */
const MAX_TILES_ACROSS = 8;

/**
 * Relative weight of a one-level zoom gap against a full-world spatial gap in
 * {@link tileDistance}. Below 1 so spatial distance dominates: the depth stack
 * over the current location outlives tiles from a location left behind.
 */
const ZOOM_DISTANCE_WEIGHT = 0.5;

/** A world-space rectangle, `[x1, x2] x [y1, y2]`. */
export interface Rect {
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
}

/** A world rectangle paired with the integer quadtree depth it is served at. */
export interface ViewportRegion {
  readonly rect: Rect;
  readonly depth: number;
}

export const clampInt = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(Math.max(value, minimum), maximum);

export const rectWidth = (rect: Rect): number => rect.x2 - rect.x1;
export const rectHeight = (rect: Rect): number => rect.y2 - rect.y1;
export const rectCenterX = (rect: Rect): number => (rect.x1 + rect.x2) / 2;
export const rectCenterY = (rect: Rect): number => (rect.y1 + rect.y2) / 2;

/** Snaps a fractional zoom to an integer, deliverable tile depth. */
export const tileZoomForViewport = (zoom: number): number =>
  clampInt(Math.round(zoom), 0, ATLAS_TILE_MAX_ZOOM);

/** Clamps a rectangle to the world bounds, keeping `min <= max`. */
export const clampRectToWorld = (rect: Rect): Rect => ({
  x1: clampInt(Math.min(rect.x1, rect.x2), 0, WORLD_SIZE),
  x2: clampInt(Math.max(rect.x1, rect.x2), 0, WORLD_SIZE),
  y1: clampInt(Math.min(rect.y1, rect.y2), 0, WORLD_SIZE),
  y2: clampInt(Math.max(rect.y1, rect.y2), 0, WORLD_SIZE),
});

/** Clamps a tile-index span to at most `MAX_TILES_ACROSS`, centred on itself. */
const clampSpan = (
  minimum: number,
  maximum: number,
  gridMaximum: number,
): readonly [number, number] => {
  if (maximum - minimum + 1 <= MAX_TILES_ACROSS) {
    return [minimum, maximum];
  }
  const centre = Math.floor((minimum + maximum) / 2);
  const start = clampInt(
    centre - Math.floor(MAX_TILES_ACROSS / 2),
    0,
    gridMaximum,
  );
  return [start, clampInt(start + MAX_TILES_ACROSS - 1, 0, gridMaximum)];
};

/** A closed tile-index range on each axis, `[minX, maxX] x [minY, maxY]`. */
interface TileRange {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Uncapped tile-index range covering `rect` at depth `z`: every tile the
 * rectangle overlaps. {@link viewportTileCount} counts these; {@link
 * requiredTiles} caps the span (see {@link clampSpan}) before enumerating them.
 */
const coverRangeForDepth = (rect: Rect, z: number): TileRange => {
  const gridSize = 2 ** z;
  const span = WORLD_SIZE / gridSize;
  const gridMaximum = gridSize - 1;
  return {
    minX: clampInt(Math.floor(rect.x1 / span), 0, gridMaximum),
    maxX: clampInt(Math.floor(rect.x2 / span), 0, gridMaximum),
    minY: clampInt(Math.floor(rect.y1 / span), 0, gridMaximum),
    maxY: clampInt(Math.floor(rect.y2 / span), 0, gridMaximum),
  };
};

/**
 * Number of tiles needed to completely cover `rect` at depth `z`, uncapped —
 * the size of {@link coverRangeForDepth}, not of the capped {@link
 * requiredTiles}. A depth can be shown without gaps only when this many of its
 * tiles are resident, so the loader compares it against how many actually
 * loaded to decide whether to display the depth.
 */
export const viewportTileCount = (rect: Rect, z: number): number => {
  const { minX, maxX, minY, maxY } = coverRangeForDepth(rect, z);
  return (maxX - minX + 1) * (maxY - minY + 1);
};

/** Tile-index range covering `rect` at depth `z`, capped to bound enumeration. */
const tileRangeForDepth = (rect: Rect, z: number): TileRange => {
  const { minX, maxX, minY, maxY } = coverRangeForDepth(rect, z);
  const gridMaximum = 2 ** z - 1;
  const [spanMinX, spanMaxX] = clampSpan(minX, maxX, gridMaximum);
  const [spanMinY, spanMaxY] = clampSpan(minY, maxY, gridMaximum);
  return { minX: spanMinX, maxX: spanMaxX, minY: spanMinY, maxY: spanMaxY };
};

/**
 * All tiles whose nodes are needed to fill `rect` at `targetDepth`: the tiles
 * at that depth intersecting the rectangle, plus every ancestor depth `0..z`
 * (which the depth loop yields for free, since shallower tiles cover the same
 * region).
 */
export const requiredTiles = (
  rect: Rect,
  targetDepth: number,
): AtlasTileCoordinate[] => {
  const coordinates: AtlasTileCoordinate[] = [];
  for (let z = 0; z <= targetDepth; z += 1) {
    const { minX, maxX, minY, maxY } = tileRangeForDepth(rect, z);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        coordinates.push({ z, x, y });
      }
    }
  }
  return coordinates;
};

/** `tileIndex` (row-major) of a coordinate, as `fetchTile` expects. */
export const tileIndexOf = (coordinate: AtlasTileCoordinate): number =>
  coordinate.y * 2 ** coordinate.z + coordinate.x;

/** Gap between two closed intervals; `0` when they overlap or touch. */
const intervalGap = (
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): number => {
  if (aMax < bMin) {
    return bMin - aMax;
  }
  if (bMax < aMin) {
    return aMin - bMax;
  }
  return 0;
};

/**
 * Distance from a tile to a viewport, in three dimensions: the planar gap
 * between the tile's world rectangle and the viewport (normalised to the world
 * size), plus a weighted zoom-level gap. The rectangle gap — rather than a
 * centre-to-centre distance — keeps an ancestor tile "near": its rectangle
 * contains the viewport, so the planar term is zero and only the (down-weighted)
 * zoom term remains.
 */
export const tileDistance = (
  coordinate: AtlasTileCoordinate,
  rect: Rect,
  targetDepth: number,
): number => {
  const bounds = atlasTileBounds(coordinate);
  const gapX = intervalGap(rect.x1, rect.x2, bounds.minimumX, bounds.maximumX);
  const gapY = intervalGap(rect.y1, rect.y2, bounds.minimumY, bounds.maximumY);
  const planar = Math.hypot(gapX, gapY) / WORLD_SIZE;
  const zoomGap = Math.abs(coordinate.z - targetDepth) / ATLAS_TILE_MAX_ZOOM;
  return Math.hypot(planar, ZOOM_DISTANCE_WEIGHT * zoomGap);
};
