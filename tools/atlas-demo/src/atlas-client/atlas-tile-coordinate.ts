/** Native Atlas wire coordinate extent along one axis. */
export const ATLAS_WORLD_SIZE = 65_536;

/** Deepest spatial tile zoom supported by the 16-bit Morton key. */
export const ATLAS_MAX_TILE_ZOOM = 16;

/** One validated quadtree address in Atlas Morton space. */
export interface AtlasTileCoordinate {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned bounds for one tile in the native Atlas coordinate square. */
export interface AtlasTileBounds {
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
}

/** Returns the stable cache key for a tile coordinate. */
export const atlasTileKey = ({ z, x, y }: AtlasTileCoordinate): string =>
  `${z}/${x}/${y}`;

/**
 * Validates a quadtree coordinate against the wire's 16-bit spatial depth.
 *
 * @throws When the zoom is outside `0..=16`, or either axis falls outside the
 *   selected zoom.
 */
export const validateAtlasTileCoordinate = (
  coordinate: AtlasTileCoordinate,
): void => {
  const { z, x, y } = coordinate;
  if (!Number.isInteger(z) || z < 0 || z > ATLAS_MAX_TILE_ZOOM) {
    throw new RangeError(
      `Atlas tile zoom must be an integer in 0..16; got ${z}`,
    );
  }

  const axisCells = 2 ** z;
  if (!Number.isInteger(x) || x < 0 || x >= axisCells) {
    throw new RangeError(
      `Atlas tile x must be an integer in 0..${axisCells - 1}; got ${x}`,
    );
  }
  if (!Number.isInteger(y) || y < 0 || y >= axisCells) {
    throw new RangeError(
      `Atlas tile y must be an integer in 0..${axisCells - 1}; got ${y}`,
    );
  }
};

/**
 * Returns half-open native-coordinate bounds for one validated tile.
 *
 * @throws When {@link validateAtlasTileCoordinate} rejects the coordinate.
 */
export const atlasTileBounds = (
  coordinate: AtlasTileCoordinate,
): AtlasTileBounds => {
  validateAtlasTileCoordinate(coordinate);
  const tileWidth = ATLAS_WORLD_SIZE / 2 ** coordinate.z;
  return {
    maximumX: (coordinate.x + 1) * tileWidth,
    maximumY: (coordinate.y + 1) * tileWidth,
    minimumX: coordinate.x * tileWidth,
    minimumY: coordinate.y * tileWidth,
  };
};

/** Returns the four direct children in stable Morton quadrant order. */
export const atlasTileChildren = (
  coordinate: AtlasTileCoordinate,
): readonly AtlasTileCoordinate[] => {
  validateAtlasTileCoordinate(coordinate);
  if (coordinate.z === ATLAS_MAX_TILE_ZOOM) {
    return [];
  }

  const x = coordinate.x * 2;
  const y = coordinate.y * 2;
  const z = coordinate.z + 1;
  return [
    { z, x, y },
    { z, x: x + 1, y },
    { z, x, y: y + 1 },
    { z, x: x + 1, y: y + 1 },
  ];
};
