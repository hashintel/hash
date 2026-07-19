/**
 * SALTILE-backed tile fetcher: serves the tiling layer's fetcher
 * contract ({@link fetchTile}'s signature) from the Surface v1 wire
 * (`../atlas/`) instead of the legacy ATLTILE4 routes. The two
 * transports deliberately coexist - this module is additive, and the
 * legacy path keeps working against the legacy demo server until the
 * SALTILE server replaces it.
 *
 * Coordinate frames: SALTILE positions arrive in the wire frame,
 * `[-1, 1]` per axis (see `../atlas/README.md`); this layer's world
 * is `[0, WORLD_SIZE)` with the same power-of-two tile grid over the
 * full frame, so tile cells align exactly and only positions need
 * mapping: `world = (wire + 1) * WORLD_SIZE / 2`. Both factors are
 * powers of two - the map is an exact, reversible display transform.
 * A point on the wire's closed `+1.0` edge lands on `WORLD_SIZE`
 * itself; that edge point renders at the boundary and plays no part
 * in tile membership, which the server decided.
 *
 * Tiles are requested in delta mode: each response carries only its
 * own cut's points, and the cache's ancestor-union assembly (union of
 * depths `0..z`, deduplicated by id) reconstructs exactly the visible
 * set - the union semantics the tiling layer already implements.
 */

import {
  AtlasClient,
  AtlasProblemError,
  type AtlasSession,
  type FetchLike,
  type RequestControls,
} from "../atlas/saltile-client";
import { ATLAS_TILE_MAX_ZOOM } from "./atlas-tile-coordinate";
import { FetchTileError, type TileNode } from "./fetch-tile";
import { WORLD_SIZE } from "./tile-geometry";

/** Construction options for {@link createSaltileTileFetcher}. */
export interface SaltileTileFetcherOptions {
  /** Atlas API origin (or same-origin proxy path) to fetch from. */
  readonly baseUrl: string;
  /** Injectable transport for tests; defaults to the global fetch. */
  readonly fetchImpl?: FetchLike;
}

/** Per-call controls, matching the cache's `TileFetchControls`. */
interface FetcherControls {
  readonly priority?: "high" | "low";
  readonly signal?: AbortSignal;
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/**
 * Creates a fetcher with the tiling layer's `TileFetcher` signature,
 * backed by an {@link AtlasClient}.
 *
 * The fetcher bootstraps a session (generation + manifest) on first
 * use and pins it; a 404 on a tile route is the generation-rotation
 * signal, answered by one re-bootstrap and retry, mirroring the
 * legacy fetcher's refresh. Decoded responses are cached inside the
 * client per (route, canonical query), so a re-requested tile costs
 * no network.
 */
export const createSaltileTileFetcher = (
  options: SaltileTileFetcherOptions,
): ((
  zoom: number,
  tileIndex: number,
  controls?: FetcherControls,
) => Promise<readonly TileNode[]>) => {
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input, init));
  const client = new AtlasClient(options.baseUrl, fetchImpl);

  let session: Promise<AtlasSession> | null = null;
  const getSession = (): Promise<AtlasSession> => {
    session ??= client.bootstrap();
    return session;
  };

  const fetchOnce = async (
    zoom: number,
    x: number,
    y: number,
    controls: RequestControls,
  ): Promise<readonly TileNode[]> => {
    const pinned = await getSession();
    if (zoom > pinned.manifest.bucketSchedule.maxZoom) {
      throw new FetchTileError(
        `zoom ${zoom} is beyond the manifest's maxZoom ${pinned.manifest.bucketSchedule.maxZoom}`,
      );
    }

    const tile = await client.tile(pinned, { z: zoom, x, y }, {}, controls);

    // Wire frame [-1, 1] onto the layer's world [0, WORLD_SIZE):
    // exact power-of-two scaling, tile grids already aligned.
    const scale = WORLD_SIZE / 2;
    const nodes: TileNode[] = new Array<TileNode>(tile.delivered);
    for (let index = 0; index < tile.delivered; index += 1) {
      nodes[index] = {
        id: tile.rowIds[index]!,
        x: (tile.positions[index * 2]! + 1) * scale,
        y: (tile.positions[index * 2 + 1]! + 1) * scale,
      };
    }
    return nodes;
  };

  return async (zoom, tileIndex, controls = {}) => {
    if (!Number.isInteger(zoom) || zoom < 0 || zoom > ATLAS_TILE_MAX_ZOOM) {
      throw new FetchTileError(
        `zoom ${zoom} must be an integer in 0..=${ATLAS_TILE_MAX_ZOOM}`,
      );
    }
    const gridSize = 2 ** zoom;
    const tileCount = gridSize * gridSize;
    if (
      !Number.isInteger(tileIndex) ||
      tileIndex < 0 ||
      tileIndex >= tileCount
    ) {
      throw new FetchTileError(
        `tileIndex ${tileIndex} must be an integer in 0..${tileCount} at zoom ${zoom}`,
      );
    }
    const x = tileIndex % gridSize;
    const y = Math.floor(tileIndex / gridSize);

    try {
      return await fetchOnce(zoom, x, y, controls);
    } catch (error) {
      // A 404 on a well-formed tile route means the pinned generation
      // rotated out. Re-bootstrap once and retry before giving up.
      if (error instanceof AtlasProblemError && error.status === 404) {
        session = null;
        return await fetchOnce(zoom, x, y, controls);
      }
      if (isAbort(error) || error instanceof FetchTileError) {
        throw error;
      }
      throw new FetchTileError(
        `failed to fetch SALTILE tile ${zoom}/${x}/${y}`,
        { cause: error },
      );
    }
  };
};
