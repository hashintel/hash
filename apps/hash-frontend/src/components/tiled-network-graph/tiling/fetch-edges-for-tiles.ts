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
 * POSTs the tile list to `/atlas/edges/{generation}/{variant}`, and decodes
 * the `SALTILEE` envelope with {@link decodeSaltileEdges}. Sources and targets
 * are node row ids — the same ids {@link fetchTile} attaches to nodes — so an
 * edge references the nodes by their delivered id.
 *
 * `detail: "auxiliary"` requests the per-edge detail trailer (link labels and
 * icons), mirroring the tile transport; the default `"minimal"` sends the
 * geometry columns alone.
 *
 * Transient failures retry with backoff (see {@link withAtlasRetry}). The two failures that end a
 * session replace it once and retry, as in {@link fetchTile}: a `404`, meaning the pinned generation
 * is no longer served, and an authority renewal the server refuses. Both arrive through
 * {@link canReplaceAtlasSession}, which also decides whether this caller is the one still entitled to
 * replace it — an ordinary `401` is not in that set, because a data route refusing a freshly minted
 * token says nothing is stale.
 */

import { decodeSaltileEdges } from "../atlas-decode/edges";
import { SALTILE_MEDIA_TYPE, SaltileDetail } from "../atlas-decode/wire";
import {
  ATLAS_API_BASE_URL,
  FetchTileError,
  requestAtlas,
  withAtlasSession,
  type SaltileSession,
} from "./fetch-tile";

import type { AtlasTileCoordinate } from "./atlas-tile-coordinate";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** One decoded edge: its link-entity identity and the node rows it connects. */
export interface TileEdge {
  /**
   * The link entity's upstream identity.
   *
   * The identity is the edge's identity on every binary surface and is
   * stable across generations.
   */
  readonly id: EntityId;
  /** Source node row id — matches a {@link TileNode.id}. */
  readonly source: number;
  /** Target node row id — matches a {@link TileNode.id}. */
  readonly target: number;
  /** Link-entity label, present with the detail trailer. */
  readonly label?: string;
  /**
   * The link's representative type as a versioned URL, present with the
   * detail trailer.
   *
   * Label and icon rendering for a type is the client's own metadata.
   */
  readonly typeId?: VersionedUrl;
}

/** A decoded edges response: its edges plus the level-of-detail cap signal. */
export interface FetchedEdges {
  /** Edges among the requested tiles' delivered rows, ascending by identity bytes. */
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
   * The request's `detail` mode. `"auxiliary"` requests the per-edge detail
   * trailer (link labels and type references). Defaults to `"minimal"`. See
   * {@link FetchTileOptions.detail}.
   */
  readonly detail?: SaltileDetail;
}

/** The edges route for a session; the variant name addresses it, as for tiles. */
const edgesUrl = (session: SaltileSession, baseUrl: string): string =>
  `${baseUrl}/edges/${session.generation}/${session.variant}`;

/** The JSON body: the tile list, plus the detail mode only when auxiliary. */
const edgesBody = (
  tiles: readonly AtlasTileCoordinate[],
  detail: SaltileDetail,
): string =>
  JSON.stringify({
    tiles: tiles.map(({ z, x, y }) => ({ z, x, y })),
    ...(detail === SaltileDetail.Auxiliary ? { detail } : {}),
  });

const fetchAndDecodeEdges = async (
  session: SaltileSession,
  tiles: readonly AtlasTileCoordinate[],
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  priority: RequestPriority | undefined,
  detail: SaltileDetail,
): Promise<FetchedEdges> => {
  const response = await requestAtlas(
    edgesUrl(session, baseUrl),
    SALTILE_MEDIA_TYPE,
    edgesBody(tiles, detail),
    signal,
    retries,
    priority,
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
      detail,
    });
  } catch (cause) {
    throw new FetchTileError("failed to decode edges", { cause });
  }

  const { count, sources, targets, edgeIds, detail: trailer } = decoded;
  const edges: TileEdge[] = new Array<TileEdge>(count);
  for (let index = 0; index < count; index += 1) {
    const id = edgeIds[index];
    const source = sources[index];
    const target = targets[index];
    // Unreachable: `decodeSaltileEdges` guarantees these column lengths. The
    // guard satisfies the strict typed-array index type without an assertion.
    if (id === undefined || source === undefined || target === undefined) {
      throw new FetchTileError(`edges record ${index} is truncated`);
    }
    const label = trailer?.linkLabels[index] ?? undefined;
    const typeId = trailer?.linkTypeIds[index] ?? undefined;
    edges[index] = {
      id,
      source,
      target,
      ...(label !== undefined ? { label } : {}),
      ...(typeId !== undefined ? { typeId } : {}),
    };
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
    detail = SaltileDetail.Minimal,
  } = options;

  if (tiles.length === 0) {
    return { edges: [], complete: true };
  }

  return withAtlasSession(baseUrl, (session) => {
    // Trimmed to the cap of the session actually being used, inside the operation rather than before
    // it: a replacement session publishes its own cap, and the tiles asked for must be the ones that
    // session serves. `tiles` is expected in priority order (see the doc).
    const capped =
      tiles.length > session.edgesTiles
        ? tiles.slice(0, session.edgesTiles)
        : tiles;

    return fetchAndDecodeEdges(
      session,
      capped,
      baseUrl,
      signal,
      retry,
      priority,
      detail,
    );
  });
};
