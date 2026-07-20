/**
 * Fetches the edges among a set of Atlas quadtree tiles over the SALTILE wire
 * and decodes them into renderable edge records.
 *
 * The edges API takes one tile list and returns every edge whose *both*
 * endpoints fall in the union of those tiles' delivered rows — so a single
 * request yields the intra-tile edges *and* the inter-tile edges that cross
 * between any two tiles in the list, with no need to enumerate tile pairs.
 *
 * The flow mirrors {@link fetchTile}: it shares the memoized
 * {@link getSaltileSession} (so tile and edge fetches bind to one generation),
 * POSTs the tile list to `/v1/atlas/edges/{generation}/{variant}`, and decodes
 * the `SALTILEE` envelope with {@link decodeSaltileEdges}. Sources and targets
 * are node row ids — the same ids {@link fetchTile} attaches to nodes — so an
 * edge references the nodes by their delivered id.
 *
 * `includeDetailedData` (per-edge link labels and icons) rides the trailer when
 * requested, mirroring the tile transport; callers leave it off until the edges
 * route serves it (version 0 rejects it with an `unsupported-feature` problem).
 * `filter` remains unsupported and is never sent.
 *
 * Transient failures retry with backoff (see {@link withAtlasRetry}); a `404`
 * (the pinned generation rotated) refreshes the session once and retries, as in
 * {@link fetchTile}.
 */

import { decodeSaltileEdges } from "../atlas-decode/edges";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/wire";
import {
  ATLAS_API_BASE_URL,
  clearAtlasSessionCache,
  FetchTileError,
  getSaltileSession,
  requestAtlas,
  type SaltileSession,
} from "./fetch-tile";

import type { AtlasTileCoordinate } from "./atlas-tile-coordinate";

/** One decoded edge: its own row id and the row ids of the nodes it connects. */
export interface TileEdge {
  /** Durable edge row id. */
  readonly id: number;
  /** Source node row id — matches a {@link TileNode.id}. */
  readonly source: number;
  /** Target node row id — matches a {@link TileNode.id}. */
  readonly target: number;
}

/** A decoded edges response: its edges plus the level-of-detail cap signal. */
export interface FetchedEdges {
  /** Edges among the requested tiles' delivered rows, ascending by edge row id. */
  readonly edges: TileEdge[];
  /**
   * Whether every qualifying edge was delivered. When `false`, the server's
   * rank-ordered cap truncated the set (it kept the edges whose worse endpoint
   * ranks best).
   */
  readonly complete: boolean;
}

/** Optional per-call overrides for {@link fetchEdgesForTiles}. */
export interface FetchEdgesForTilesOptions {
  /** Atlas API origin. Defaults to {@link ATLAS_API_BASE_URL}. */
  readonly baseUrl?: string;
  /** Cancels the edges request. */
  readonly signal?: AbortSignal;
  /** Retries on a transient failure. Defaults to {@link fetchTile}'s policy. */
  readonly retry?: number;
  /** Network priority hint; see {@link FetchTileOptions.priority}. */
  readonly priority?: RequestPriority;
  /**
   * Requests the per-edge detail trailer (link labels and icons). Defaults to
   * `false`; the version-0 edges route rejects it, so callers keep it off until
   * the server serves it. See {@link FetchTileOptions.includeDetailedData}.
   */
  readonly includeDetailedData?: boolean;
}

/** The edges route for a session; the variant name addresses it, as for tiles. */
const edgesUrl = (session: SaltileSession, baseUrl: string): string =>
  `${baseUrl}/v1/atlas/edges/${session.generation}/${session.variant}`;

/** The JSON body: the tile list, plus the detail flag only when requested. */
const edgesBody = (
  tiles: readonly AtlasTileCoordinate[],
  includeDetailedData: boolean,
): string =>
  JSON.stringify({
    tiles: tiles.map(({ z, x, y }) => ({ z, x, y })),
    ...(includeDetailedData ? { includeDetailedData: true } : {}),
  });

const fetchAndDecodeEdges = async (
  session: SaltileSession,
  tiles: readonly AtlasTileCoordinate[],
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  priority: RequestPriority | undefined,
  includeDetailedData: boolean,
): Promise<FetchedEdges> => {
  const response = await requestAtlas(
    edgesUrl(session, baseUrl),
    SALTILE_MEDIA_TYPE,
    signal,
    retries,
    priority,
    edgesBody(tiles, includeDetailedData),
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(SALTILE_MEDIA_TYPE)) {
    throw new FetchTileError(
      `edges arrived as ${contentType}; expected ${SALTILE_MEDIA_TYPE}`,
    );
  }
  const buffer = await response.arrayBuffer();

  let decoded;
  try {
    decoded = decodeSaltileEdges(buffer, {
      generation: session.generationBytes,
      variant: session.variantIndex,
      includeDetailedData,
    });
  } catch (cause) {
    throw new FetchTileError("failed to decode edges", { cause });
  }

  const { count, sources, targets, rowIds } = decoded;
  const edges: TileEdge[] = new Array<TileEdge>(count);
  for (let index = 0; index < count; index += 1) {
    const id = rowIds[index];
    const source = sources[index];
    const target = targets[index];
    // Unreachable: `decodeSaltileEdges` guarantees these column lengths. The
    // guard satisfies the strict typed-array index type without an assertion.
    if (id === undefined || source === undefined || target === undefined) {
      throw new FetchTileError(`edges record ${index} is truncated`);
    }
    edges[index] = { id, source, target };
  }

  return { edges, complete: decoded.complete };
};

/**
 * Fetches the edges among `tiles` — every edge whose both endpoints fall in the
 * union of the tiles' delivered rows, so intra- and inter-tile edges arrive
 * together from one request.
 *
 * The manifest's `edgesTiles` limit caps a single request's tile list. This
 * transport trims `tiles` to that cap rather than letting the server reject an
 * over-long list, so callers should order `tiles` by importance (e.g. nearest
 * the viewport first) since the tail beyond the cap is dropped. In practice a
 * viewport touches far fewer tiles than the cap, so nothing is dropped.
 *
 * @returns The decoded edges and a `complete` flag (`false` when the server's
 *   rank-ordered edge cap truncated the set). An empty `tiles` list resolves to
 *   no edges without a request.
 * @throws {@link FetchTileError} when a request fails or is rejected, or the
 *   payload fails to decode or does not belong to the active generation.
 */
export const fetchEdgesForTiles = async (
  tiles: readonly AtlasTileCoordinate[],
  options: FetchEdgesForTilesOptions = {},
): Promise<FetchedEdges> => {
  const {
    baseUrl = ATLAS_API_BASE_URL,
    signal,
    retry,
    priority,
    includeDetailedData = false,
  } = options;

  if (tiles.length === 0) {
    return { edges: [], complete: true };
  }

  const session = await getSaltileSession(baseUrl);

  // Trim to the served cap; `tiles` is expected in priority order (see the doc).
  const capped =
    tiles.length > session.edgesTiles
      ? tiles.slice(0, session.edgesTiles)
      : tiles;

  try {
    return await fetchAndDecodeEdges(
      session,
      capped,
      baseUrl,
      signal,
      retry,
      priority,
      includeDetailedData,
    );
  } catch (error) {
    // A 404 means the pinned generation is no longer active; re-bootstrap once.
    if (error instanceof FetchTileError && error.status === 404) {
      clearAtlasSessionCache(baseUrl);
      const refreshed = await getSaltileSession(baseUrl);
      const recapped =
        tiles.length > refreshed.edgesTiles
          ? tiles.slice(0, refreshed.edgesTiles)
          : tiles;
      return await fetchAndDecodeEdges(
        refreshed,
        recapped,
        baseUrl,
        signal,
        retry,
        priority,
        includeDetailedData,
      );
    }
    throw error;
  }
};
