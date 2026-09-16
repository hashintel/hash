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

import * as Num from "../atlas-decode/Num";
import {
  ATLAS_TILE_MAX_ZOOM,
  atlasGridSize,
  atlasTileBounds,
  WORLD_SIZE,
  WORLD_SIZE_U64,
} from "./atlas-tile-coordinate";

import type * as TileDocument from "../atlas-decode/TileDocument";

const { zero, one } = Num.u64;
const two = Num.u64.unsafe(2n);

/**
 * Cap on tiles enumerated per depth along each axis. Bounds the work when a
 * viewport rectangle and zoom disagree (e.g. the whole world at a deep zoom),
 * which would otherwise enumerate an entire grid level.
 */
const MAX_TILES_ACROSS = Num.u64.unsafe(8n);

/**
 * Relative weight of a one-level zoom gap against a full-world spatial gap in
 * {@link tileDistance}. Below 1 so spatial distance dominates: the depth stack
 * over the current location outlives tiles from a location left behind.
 */
const ZOOM_DISTANCE_WEIGHT = 0.5;

/** A world-space rectangle, `[x1, x2] x [y1, y2]`. */
export interface Rect {
  readonly x1: Num.u64;
  readonly x2: Num.u64;
  readonly y1: Num.u64;
  readonly y2: Num.u64;
}

/** A world rectangle paired with the integer quadtree depth it is served at. */
export interface ViewportRegion {
  readonly rect: Rect;
  readonly depth: Num.u64;
}

export const clampInt = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(Math.max(value, minimum), maximum);

export const rectWidth = (rect: Rect): Num.u64 =>
  Num.u64.sub.unchecked(rect.x2, rect.x1);
export const rectHeight = (rect: Rect): Num.u64 =>
  Num.u64.sub.unchecked(rect.y2, rect.y1);
export const rectCenterX = (rect: Rect): Num.u64 =>
  Num.u64.div.unchecked(Num.u64.add.unchecked(rect.x1, rect.x2), two);
export const rectCenterY = (rect: Rect): Num.u64 =>
  Num.u64.div.unchecked(Num.u64.add.unchecked(rect.y1, rect.y2), two);

/** Snaps a fractional zoom to an integer, deliverable tile depth. */
export const tileZoomForViewport = (zoom: Num.u64): Num.u64 =>
  Num.u64.clamp(zoom, Num.u64.minValue, ATLAS_TILE_MAX_ZOOM);

/** Clamps a rectangle to the world bounds, keeping `min <= max`. */
export const clampRectToWorld = (rect: Rect): Rect => {
  const [x1, x2] = Num.u64.minMax(rect.x1, rect.x2);
  const [y1, y2] = Num.u64.minMax(rect.y1, rect.y2);

  return {
    x1: Num.u64.min(x1, WORLD_SIZE_U64),
    x2: Num.u64.min(x2, WORLD_SIZE_U64),
    y1: Num.u64.min(y1, WORLD_SIZE_U64),
    y2: Num.u64.min(y2, WORLD_SIZE_U64),
  };
};

/** The last tile index on each axis at depth `z`. */
const gridMaximumAt = (z: Num.u64): Num.u64 =>
  Num.u64.sub.unchecked(atlasGridSize(z), one);

/** Number of indices in a closed span, `maximum - minimum + 1`. */
const spanLength = (minimum: Num.u64, maximum: Num.u64): Num.u64 =>
  Num.u64.add.unchecked(Num.u64.sub.unchecked(maximum, minimum), one);

/** Clamps a tile-index span to at most `MAX_TILES_ACROSS`, centred on itself. */
const clampSpan = (
  minimum: Num.u64,
  maximum: Num.u64,
  gridMaximum: Num.u64,
): readonly [Num.u64, Num.u64] => {
  if (spanLength(minimum, maximum) <= MAX_TILES_ACROSS) {
    return [minimum, maximum];
  }

  const centre = Num.u64.div.unchecked(
    Num.u64.add.unchecked(minimum, maximum),
    two,
  );
  const halfSpan = Num.u64.div.unchecked(MAX_TILES_ACROSS, two);
  // The span exceeds the cap, so the centre is at least half of it from zero.
  const start = Num.u64.min(
    Num.u64.sub.unchecked(centre, halfSpan),
    gridMaximum,
  );

  return [
    start,
    Num.u64.min(
      Num.u64.sub.unchecked(
        Num.u64.add.unchecked(start, MAX_TILES_ACROSS),
        one,
      ),
      gridMaximum,
    ),
  ];
};

/** A closed tile-index range on each axis, `[minX, maxX] x [minY, maxY]`. */
interface TileRange {
  readonly minX: Num.u64;
  readonly maxX: Num.u64;
  readonly minY: Num.u64;
  readonly maxY: Num.u64;
}

/**
 * Uncapped tile-index range covering `rect` at depth `z`: every tile the
 * rectangle overlaps. {@link viewportTileCount} counts these; {@link
 * requiredTiles} caps the span (see {@link clampSpan}) before enumerating them.
 */
const coverRangeForDepth = (rect: Rect, z: Num.u64): TileRange => {
  const gridSize = atlasGridSize(z);

  const span = Num.u64.div.unchecked(WORLD_SIZE_U64, gridSize);
  const gridMaximum = gridMaximumAt(z);

  return {
    minX: Num.u64.min(Num.u64.div.unchecked(rect.x1, span), gridMaximum),
    maxX: Num.u64.min(Num.u64.div.unchecked(rect.x2, span), gridMaximum),
    minY: Num.u64.min(Num.u64.div.unchecked(rect.y1, span), gridMaximum),
    maxY: Num.u64.min(Num.u64.div.unchecked(rect.y2, span), gridMaximum),
  };
};

/**
 * Number of tiles needed to completely cover `rect` at depth `z`, uncapped —
 * the size of {@link coverRangeForDepth}, not of the capped {@link
 * requiredTiles}. A depth can be shown without gaps only when this many of its
 * tiles are resident, so the loader compares it against how many actually
 * loaded to decide whether to display the depth.
 */
export const viewportTileCount = (rect: Rect, z: Num.u64): Num.u64 => {
  const { minX, maxX, minY, maxY } = coverRangeForDepth(rect, z);

  return Num.u64.mul.unchecked(spanLength(minX, maxX), spanLength(minY, maxY));
};

/** Tile-index range covering `rect` at depth `z`, capped to bound enumeration. */
const tileRangeForDepth = (rect: Rect, z: Num.u64): TileRange => {
  const { minX, maxX, minY, maxY } = coverRangeForDepth(rect, z);
  const gridMaximum = gridMaximumAt(z);

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
  targetDepth: Num.u64,
): TileDocument.Coordinate[] => {
  const coordinates: TileDocument.Coordinate[] = [];
  for (const z of Num.u64.range.inclusive(zero, targetDepth)) {
    const { minX, maxX, minY, maxY } = tileRangeForDepth(rect, z);

    for (const y of Num.u64.range.inclusive(minY, maxY)) {
      for (const x of Num.u64.range.inclusive(minX, maxX)) {
        coordinates.push({ z, x, y });
      }
    }
  }
  return coordinates;
};

/**
 * The four depth-`z+1` quadrants a tile subdivides into (row-major: NW, NE, SW,
 * SE). Used by the completeness-pruned descent to step one level finer into a
 * tile whose subtree is not yet fully delivered.
 */
export const childCoordinates = (
  coordinate: TileDocument.Coordinate,
): TileDocument.Coordinate[] => {
  const z = Num.u64.add.unchecked(coordinate.z, one);
  const x = Num.u64.mul.unchecked(coordinate.x, two);
  const y = Num.u64.mul.unchecked(coordinate.y, two);
  const nextX = Num.u64.add.unchecked(x, one);
  const nextY = Num.u64.add.unchecked(y, one);

  return [
    { z, x, y },
    { z, x: nextX, y },
    { z, x, y: nextY },
    { z, x: nextX, y: nextY },
  ];
};

/**
 * Whether a tile's world rectangle overlaps `rect`. Tile bounds are half-open
 * (`[minimum, maximum)`), matching {@link coverRangeForDepth}'s `floor` cover, so
 * a tile counts when its minimum is at or before `rect`'s far edge and its
 * maximum is strictly past `rect`'s near edge.
 */
export const tileIntersectsRect = (
  coordinate: TileDocument.Coordinate,
  rect: Rect,
): boolean => {
  const bounds = atlasTileBounds(coordinate);
  return (
    bounds.minimumX <= rect.x2 &&
    bounds.maximumX > rect.x1 &&
    bounds.minimumY <= rect.y2 &&
    bounds.maximumY > rect.y1
  );
};

/** Gap between two closed intervals; `0` when they overlap or touch. */
const intervalGap = (
  aMin: Num.u64,
  aMax: Num.u64,
  bMin: Num.u64,
  bMax: Num.u64,
): Num.u64 => {
  if (aMax < bMin) {
    return Num.u64.sub.unchecked(bMin, aMax);
  }

  if (bMax < aMin) {
    return Num.u64.sub.unchecked(aMin, bMax);
  }

  return Num.u64.minValue;
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
  coordinate: TileDocument.Coordinate,
  rect: Rect,
  targetDepth: Num.u64,
): number => {
  const bounds = atlasTileBounds(coordinate);
  const gapX = intervalGap(rect.x1, rect.x2, bounds.minimumX, bounds.maximumX);
  const gapY = intervalGap(rect.y1, rect.y2, bounds.minimumY, bounds.maximumY);
  const [nearDepth, farDepth] = Num.u64.minMax(coordinate.z, targetDepth);
  const depthGap = Num.u64.sub.unchecked(farDepth, nearDepth);

  // The metric is a float heuristic, so integers enter it by rounding. Gaps are
  // bounded by the world size and depths by the maximum zoom, so all are exact.
  const planar =
    Math.hypot(Num.f64.approximate(gapX), Num.f64.approximate(gapY)) /
    WORLD_SIZE;
  const zoomGap =
    Num.f64.approximate(depthGap) / Num.f64.approximate(ATLAS_TILE_MAX_ZOOM);

  return Math.hypot(planar, ZOOM_DISTANCE_WEIGHT * zoomGap);
};
