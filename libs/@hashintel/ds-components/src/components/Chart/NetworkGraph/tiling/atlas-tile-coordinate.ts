/**
 * Addressing for the Morton (Z-order) quadtree the Atlas tile API serves.
 *
 * A coordinate names one quadrant of the 16-bit quantized world: `z` is the
 * quadtree depth (`0..=16`) and `x`/`y` the quadrant at that depth, each below
 * `2 ** z`. Every zoom level splits each tile into four, so depth `z` tiles the
 * world into a `2 ** z` by `2 ** z` grid whose cells each span
 * {@link ATLAS_TILE_AXIS_SIZE} `>> z` world units.
 *
 * {@link decodeAtlasTile} depends on this module to validate the requested
 * route and to bound the delivered point records, so the bounds here must match
 * the server's quantization exactly.
 */

/** Deepest quadtree zoom the tile grid addresses (the wire allows `0..=16`). */
export const ATLAS_TILE_MAX_ZOOM = 16;

/**
 * Width and height of the quantized world axis the grid tiles over: the tile
 * wire stores positions as `Uint16`, so each axis spans `[0, 65536)`.
 */
export const ATLAS_TILE_AXIS_SIZE = 65_536;

/** One quadrant of the Atlas quadtree at a given zoom depth. */
export interface AtlasTileCoordinate {
  /** Quadtree depth, `0..={@link ATLAS_TILE_MAX_ZOOM}`. */
  readonly z: number;
  /** Quadrant column at depth `z`; `0..(2 ** z)`. */
  readonly x: number;
  /** Quadrant row at depth `z`; `0..(2 ** z)`. */
  readonly y: number;
}

/** Half-open world-coordinate extent a tile covers: `[minimum, maximum)`. */
export interface AtlasTileBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

/** A tile coordinate fell outside the addressable quadtree. */
export class AtlasTileCoordinateError extends Error {
  override readonly name = "AtlasTileCoordinateError";
}

/**
 * Asserts that `coordinate` names an addressable quadrant.
 *
 * @throws {@link AtlasTileCoordinateError} when `z` is outside
 *   `0..={@link ATLAS_TILE_MAX_ZOOM}`, or `x`/`y` is not an integer inside the
 *   `2 ** z` by `2 ** z` grid.
 */
export const validateAtlasTileCoordinate = (
  coordinate: AtlasTileCoordinate,
): void => {
  const { z, x, y } = coordinate;

  if (!Number.isInteger(z) || z < 0 || z > ATLAS_TILE_MAX_ZOOM) {
    throw new AtlasTileCoordinateError(
      `tile zoom ${z} is outside 0..=${ATLAS_TILE_MAX_ZOOM}`,
    );
  }

  const gridSize = 2 ** z;
  if (!Number.isInteger(x) || x < 0 || x >= gridSize) {
    throw new AtlasTileCoordinateError(
      `tile x ${x} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }
  if (!Number.isInteger(y) || y < 0 || y >= gridSize) {
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
  coordinate: AtlasTileCoordinate,
): AtlasTileBounds => {
  validateAtlasTileCoordinate(coordinate);

  // Exact integer division: the axis is a power of two and `z <= 16`, so the
  // span runs from 65536 (z = 0) down to 1 (z = 16) with no remainder.
  const span = ATLAS_TILE_AXIS_SIZE / 2 ** coordinate.z;
  const minimumX = coordinate.x * span;
  const minimumY = coordinate.y * span;

  return {
    minimumX,
    maximumX: minimumX + span,
    minimumY,
    maximumY: minimumY + span,
  };
};

/** Stable `z/x/y` key for a tile, used in cache keys and error detail. */
export const atlasTileKey = (coordinate: AtlasTileCoordinate): string =>
  `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
