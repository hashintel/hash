import type * as TileDocument from "../atlas-decode/TileDocument";

/**
 * Addressing for the Morton (Z-order) quadtree the Atlas tile API serves.
 *
 * A coordinate names one quadrant of the 16-bit quantized world: `z` is the
 * quadtree depth (`0..=16`) and `x`/`y` the quadrant at that depth, each below
 * `2 ** z`. Every zoom level splits each tile into four, so depth `z` tiles the
 * world into a `2 ** z` by `2 ** z` grid whose cells each span
 * {@link ATLAS_TILE_AXIS_SIZE} `>> z` world units.
 *
 * The tiling and viewport math depend on this module to address tiles and to
 * bound tile rectangles ({@link atlasTileBounds}), so the grid here must match
 * the server's tiling exactly.
 */

/** Deepest quadtree zoom the tile grid addresses (the wire allows `0..=16`). */
export const ATLAS_TILE_MAX_ZOOM = 16n;

/**
 * Width and height of the world axis the grid tiles over. The renderer's world
 * frame spans `[0, 65536)` per axis; the SALTILE wire frame `[-1, 1]` maps onto
 * it (see `fetch-tile.ts`), and depth `{@link ATLAS_TILE_MAX_ZOOM}` resolves to
 * one world unit per cell.
 */
export const ATLAS_TILE_AXIS_SIZE = 65_536;

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
export const validateAtlasTileCoordinate = ({
  z,
  x,
  y,
}: TileDocument.Coordinate): void => {
  if (z < 0n || z > ATLAS_TILE_MAX_ZOOM) {
    throw new AtlasTileCoordinateError(
      `tile zoom ${z} is outside 0..=${ATLAS_TILE_MAX_ZOOM}`,
    );
  }

  const gridSize = 2n ** z;
  if (x < 0n || x >= gridSize) {
    throw new AtlasTileCoordinateError(
      `tile x ${x} is outside the ${gridSize} by ${gridSize} grid at zoom ${z}`,
    );
  }

  if (y < 0n || y >= gridSize) {
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

  // Exact integer division: the axis is a power of two and `z <= 16`, so the
  // span runs from 65536 (z = 0) down to 1 (z = 16) with no remainder.
  const span = ATLAS_TILE_AXIS_SIZE / 2 ** Number(coordinate.z);
  const minimumX = Number(coordinate.x) * span;
  const minimumY = Number(coordinate.y) * span;

  return {
    minimumX,
    maximumX: minimumX + span,
    minimumY,
    maximumY: minimumY + span,
  };
};

/** Stable `z/x/y` key for a tile, used in cache keys and error detail. */
export const atlasTileKey = (coordinate: TileDocument.Coordinate): string =>
  `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
