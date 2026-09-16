import * as Num from "../atlas-decode/Num";

import type * as TileDocument from "../atlas-decode/TileDocument";

/**
 * Addressing for the Morton (Z-order) quadtree the Atlas tile API serves.
 *
 * A coordinate names one quadrant of the 16-bit quantized world: `z` is the
 * quadtree depth (`0..=16`) and `x`/`y` the quadrant at that depth, each below
 * `2 ** z`. Every zoom level splits each tile into four, so depth `z` tiles the
 * world into a `2 ** z` by `2 ** z` grid whose cells each span
 * {@link WORLD_SIZE} `>> z` world units.
 *
 * The tiling and viewport math depend on this module to address tiles and to
 * bound tile rectangles ({@link atlasTileBounds}), so the grid here must match
 * the server's tiling exactly.
 */

const { zero } = Num.u64;
const two = Num.u64.unsafe(2n);

/** Deepest quadtree zoom the tile grid addresses (the wire allows `0..=16`). */
export const ATLAS_TILE_MAX_ZOOM = Num.u64.unsafe(16n);

/** Tiles per axis at depth `z`, `2 ** z`. */
export const atlasGridSize = (z: Num.u64): Num.u64 =>
  Num.u64.pow.unchecked(two, z);

/**
 * Width and height of the world axis the grid tiles over. The renderer's world
 * frame spans `[0, 65536)` per axis; the SALTILE wire frame `[-1, 1]` maps onto
 * it (see `fetch-tile.ts`), and depth `{@link ATLAS_TILE_MAX_ZOOM}` resolves to
 * one world unit per cell, so the axis is that depth's grid size.
 */
export const WORLD_SIZE_U64 = atlasGridSize(ATLAS_TILE_MAX_ZOOM);
/** {@link WORLD_SIZE_U64} for float arithmetic (`65536`). */
export const WORLD_SIZE = Num.f64.approximate(WORLD_SIZE_U64);

/** The depth-0 tile covering the whole world. */
export const ATLAS_ROOT_COORDINATE: TileDocument.Coordinate = {
  z: zero,
  x: zero,
  y: zero,
};

/** Half-open world-coordinate extent a tile covers: `[minimum, maximum)`. */
export interface AtlasTileBounds {
  readonly minimumX: Num.u64;
  readonly maximumX: Num.u64;
  readonly minimumY: Num.u64;
  readonly maximumY: Num.u64;
}

/** A tile coordinate fell outside the addressable quadtree. */
export class AtlasTileCoordinateError extends Error {
  override readonly name = "AtlasTileCoordinateError";
}

/**
 * Asserts that `z` is an addressable depth.
 *
 * @throws {@link AtlasTileCoordinateError} when `z` exceeds
 *   {@link ATLAS_TILE_MAX_ZOOM}.
 */
export const validateAtlasZoom = (z: Num.u64): void => {
  if (z > ATLAS_TILE_MAX_ZOOM) {
    throw new AtlasTileCoordinateError(
      `tile zoom ${z} is outside 0..=${ATLAS_TILE_MAX_ZOOM}`,
    );
  }
};

/**
 * Asserts that `coordinate` names an addressable quadrant.
 *
 * @throws {@link AtlasTileCoordinateError} when `z` exceeds
 *   {@link ATLAS_TILE_MAX_ZOOM}, or `x`/`y` is outside the `2 ** z` by `2 ** z`
 *   grid.
 */
export const validateAtlasTileCoordinate = ({
  z,
  x,
  y,
}: TileDocument.Coordinate): void => {
  validateAtlasZoom(z);

  const gridSize = atlasGridSize(z);
  if (x >= gridSize) {
    throw new AtlasTileCoordinateError(
      `tile x ${x} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }

  if (y >= gridSize) {
    throw new AtlasTileCoordinateError(
      `tile y ${y} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }
};

/**
 * World-coordinate extent {@link coordinate} covers. `maximumX`/`maximumY` are
 * exclusive, matching the tile wire's `[minimum, maximum)` point membership.
 */
export const atlasTileBounds = (
  coordinate: TileDocument.Coordinate,
): AtlasTileBounds => {
  validateAtlasTileCoordinate(coordinate);

  // Exact division: the axis is `2 ** 16` and `z <= 16`, so the span runs from
  // 65536 (z = 0) down to 1 (z = 16) with no remainder. The validated
  // coordinate keeps every product and sum at or below the axis size.
  const span = Num.u64.div.unchecked(
    WORLD_SIZE_U64,
    atlasGridSize(coordinate.z),
  );
  const minimumX = Num.u64.mul.unchecked(coordinate.x, span);
  const minimumY = Num.u64.mul.unchecked(coordinate.y, span);

  return {
    minimumX,
    maximumX: Num.u64.add.unchecked(minimumX, span),
    minimumY,
    maximumY: Num.u64.add.unchecked(minimumY, span),
  };
};

/** Row-major `y * gridSize + x` index of a tile within its depth. */
export const atlasTileIndex = (coordinate: TileDocument.Coordinate): Num.u64 =>
  Num.u64.add.unchecked(
    Num.u64.mul.unchecked(coordinate.y, atlasGridSize(coordinate.z)),
    coordinate.x,
  );

/**
 * Inverse of {@link atlasTileIndex}: the coordinate at a row-major index.
 *
 * @throws {@link AtlasTileCoordinateError} when `z` exceeds
 *   {@link ATLAS_TILE_MAX_ZOOM} or `index` is outside the `4 ** z` tiles.
 */
export const atlasTileAtIndex = (
  z: Num.u64,
  index: Num.u64,
): TileDocument.Coordinate => {
  validateAtlasZoom(z);

  const gridSize = atlasGridSize(z);
  const tileCount = Num.u64.mul.unchecked(gridSize, gridSize);
  if (index >= tileCount) {
    throw new AtlasTileCoordinateError(
      `tile index ${index} is outside the ${tileCount} tiles at zoom ${z}`,
    );
  }

  return {
    z,
    x: Num.u64.rem.unchecked(index, gridSize),
    y: Num.u64.div.unchecked(index, gridSize),
  };
};

/** Stable `z/x/y` key for a tile, used in cache keys and error detail. */
export const atlasTileKey = (coordinate: TileDocument.Coordinate): string =>
  `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
