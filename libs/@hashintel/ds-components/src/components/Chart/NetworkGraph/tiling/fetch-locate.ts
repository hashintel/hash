/**
 * Fetches one Atlas "locate" spotlight subgraph over the SALTILE wire and
 * decodes it into renderable node/edge records.
 *
 * `POST /v1/atlas/locate/{generation}/{variant}` resolves a source entity to
 * its dot and answers its **ego-graph**: the source is delivered first,
 * followed by the delivered edges' partners (both directions, ascending wire
 * row id), with every edge incident to the source riding the edge columns
 * (ascending wire edge id, a self-loop exactly once). When the edge cap
 * truncates, edges whose partners lie nearest the source are kept and
 * `complete` reads `false`; zero edges with `complete: true` is the honest
 * answer for an unlinked source. It is the detail view, so
 * `includeDetailedData` defaults on: every delivered node
 * carries a label, icon, and its capped simple-value properties, and every
 * delivered edge carries the four link-detail fields.
 *
 * The flow mirrors {@link fetchTile}: it shares the memoized
 * {@link getSaltileSession} (so locate binds to the same generation as the
 * viewport's tiles), POSTs the request, decodes the `SALTILEL` envelope with
 * {@link decodeSaltileLocate}, and maps wire-frame positions onto the layer's
 * world exactly as the tile transport does. Transient failures retry with
 * backoff; a `404` refreshes the session once and retries (a locate `404` may
 * instead be `unknown-entity` — the retry then re-throws it).
 *
 * ## Source id
 *
 * The request names its source in one of two domains: `entityId` (an upstream
 * identity a search result or deep link carries) or `row` (the wire node/edge
 * row id a rendered tile put in the client's hand). This transport takes the
 * latter — the **atlas id** — since that is what a rendered node or edge holds,
 * so it sends the id in the `row` field. (Sending it as `entityId` would ask
 * the server to parse a row id as an upstream identity, which fails as
 * `unknown-entity`.)
 */

import {
  decodeSaltileLocate,
  type SaltilePropertyValue,
} from "../atlas-decode/locate";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/wire";
import {
  ATLAS_API_BASE_URL,
  clearAtlasSessionCache,
  FetchTileError,
  getSaltileSession,
  requestAtlas,
  typeIndicesAt,
  type SaltileSession,
} from "./fetch-tile";
import { WORLD_SIZE } from "./tile-geometry";

export type { SaltilePropertyValue } from "../atlas-decode/locate";

/** One located node: a row id, world coordinates, and (detailed) hydration. */
export interface LocateNode {
  /** Durable node row id — matches a tile node's id. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Human-readable label, present with the detail trailer. */
  readonly label?: string;
  /** Entity icon (emoji or `/path`/`https` URL), present with the trailer. */
  readonly icon?: string;
  /** Matched {@link FetchLocateOptions.coloredTypeIds} indices; see {@link typeIndicesAt}. */
  readonly typeIndices?: readonly number[];
  /**
   * The entity's capped simple-value properties keyed by property base URL,
   * present with the detail trailer. `null` marks an entity the store no
   * longer serves.
   */
  readonly properties?: Readonly<Record<string, SaltilePropertyValue>> | null;
}

/** One located edge: its row id, endpoints, and (detailed) link hydration. */
export interface LocateEdge {
  /** Durable edge row id. */
  readonly id: number;
  /** Source node row id — matches a {@link LocateNode.id}. */
  readonly source: number;
  /** Target node row id — matches a {@link LocateNode.id}. */
  readonly target: number;
  /** Link-entity label, present with the detail trailer. */
  readonly label?: string;
  readonly icon?: string;
  /** Link *type* label/icon (e.g. the "Authored By" type), present with the trailer. */
  readonly typeLabel?: string;
  readonly typeIcon?: string;
}

/**
 * A decoded locate ego-graph plus the source's fly-to target.
 *
 * Partners are delivered wherever they live — they may lie outside the
 * current viewport. Whether the client flies to them or clamps the camera is
 * a product decision this transport does not make; `cell`/`zoom` always name
 * the **source's** fly-to target.
 */
export interface LocatedEntity {
  /** The source (index 0) followed by its partners (ascending wire row id). */
  readonly nodes: LocateNode[];
  /** The edges incident to the source (ascending wire edge id). */
  readonly edges: LocateEdge[];
  /** The source's first visible zoom and its tile there — a fly-to target. */
  readonly cell: { readonly z: number; readonly x: number; readonly y: number };
  readonly zoom: number;
  /** False when the locate edge cap truncated the subgraph. */
  readonly complete: boolean;
}

/** Optional per-call overrides for {@link fetchLocate}. */
export interface FetchLocateOptions {
  /** Atlas API origin. Defaults to {@link ATLAS_API_BASE_URL}. */
  readonly baseUrl?: string;
  /** Cancels the locate request. */
  readonly signal?: AbortSignal;
  /** Retries on a transient failure. Defaults to {@link fetchTile}'s policy. */
  readonly retry?: number;
  /**
   * Versioned type URLs conditioning the response's `TYPE_MASK`, so each node
   * carries {@link LocateNode.typeIndices}. Capped by `limits.coloredTypeIds`.
   * Defaults to none.
   */
  readonly coloredTypeIds?: readonly string[];
  /**
   * Requests the detail trailer (labels, icons, properties, link detail).
   * Locate defaults it **on** — it is the detail view — so pass `false` only to
   * fetch geometry alone.
   */
  readonly includeDetailedData?: boolean;
}

/** The locate route for a session; the variant name addresses it, as for tiles. */
const locateUrl = (session: SaltileSession, baseUrl: string): string =>
  `${baseUrl}/v1/atlas/locate/${session.generation}/${session.variant}`;

/** The JSON body: the source id, plus the delivery knobs when non-default. */
const locateBody = (
  atlasId: number,
  coloredTypeIds: readonly string[],
  includeDetailedData: boolean,
): string =>
  JSON.stringify({
    // The atlas id is a wire row id, so it names the source via `row` (not
    // `entityId`, which is for upstream identities).
    row: atlasId,
    ...(coloredTypeIds.length > 0 ? { coloredTypeIds } : {}),
    // Locate defaults detail on, so only the opt-out rides the body.
    ...(includeDetailedData ? {} : { includeDetailedData: false }),
  });

const fetchAndDecodeLocate = async (
  session: SaltileSession,
  atlasId: number,
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  coloredTypeIds: readonly string[],
  includeDetailedData: boolean,
): Promise<LocatedEntity> => {
  const response = await requestAtlas(
    locateUrl(session, baseUrl),
    SALTILE_MEDIA_TYPE,
    signal,
    retries,
    undefined,
    locateBody(atlasId, coloredTypeIds, includeDetailedData),
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(SALTILE_MEDIA_TYPE)) {
    throw new FetchTileError(
      `locate arrived as ${contentType}; expected ${SALTILE_MEDIA_TYPE}`,
    );
  }
  const buffer = await response.arrayBuffer();

  let decoded;
  try {
    decoded = decodeSaltileLocate(buffer, {
      generation: session.generationBytes,
      variant: session.variantIndex,
      coloredTypeIdCount: coloredTypeIds.length,
      includeDetailedData,
    });
  } catch (cause) {
    throw new FetchTileError("failed to decode locate", { cause });
  }

  const { count, positions, rowIds, typeMask, detail } = decoded;
  // Wire frame [-1, 1] onto the layer's world [0, WORLD_SIZE): an exact
  // power-of-two scale, as in the tile transport.
  const scale = WORLD_SIZE / 2;
  const maskStride = Math.ceil(coloredTypeIds.length / 8);
  const nodes: LocateNode[] = new Array<LocateNode>(count);
  for (let index = 0; index < count; index += 1) {
    const id = rowIds[index];
    const wireX = positions[index * 2];
    const wireY = positions[index * 2 + 1];
    // Unreachable: the decoder guarantees these array lengths. The guard
    // satisfies the strict typed-array index type without an assertion.
    if (id === undefined || wireX === undefined || wireY === undefined) {
      throw new FetchTileError(`locate node ${index} is truncated`);
    }
    const label = detail?.labels[index] ?? undefined;
    const icon = detail?.icons[index] ?? undefined;
    const properties = detail ? detail.properties[index] : undefined;
    const typeIndices = typeMask
      ? typeIndicesAt(typeMask, index, maskStride, coloredTypeIds.length)
      : undefined;
    nodes[index] = {
      id,
      x: (wireX + 1) * scale,
      y: (wireY + 1) * scale,
      ...(label !== undefined ? { label } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(typeIndices !== undefined ? { typeIndices } : {}),
      ...(properties !== undefined ? { properties } : {}),
    };
  }

  const { edgesCount, sources, targets, edgeRowIds } = decoded;
  const edges: LocateEdge[] = new Array<LocateEdge>(edgesCount);
  for (let index = 0; index < edgesCount; index += 1) {
    const id = edgeRowIds[index];
    const source = sources[index];
    const target = targets[index];
    if (id === undefined || source === undefined || target === undefined) {
      throw new FetchTileError(`locate edge ${index} is truncated`);
    }
    const label = detail?.linkLabels[index] ?? undefined;
    const icon = detail?.linkIcons[index] ?? undefined;
    const typeLabel = detail?.linkTypeLabels[index] ?? undefined;
    const typeIcon = detail?.linkTypeIcons[index] ?? undefined;
    edges[index] = {
      id,
      source,
      target,
      ...(label !== undefined ? { label } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(typeLabel !== undefined ? { typeLabel } : {}),
      ...(typeIcon !== undefined ? { typeIcon } : {}),
    };
  }

  return {
    nodes,
    edges,
    cell: decoded.cell,
    zoom: decoded.zoom,
    complete: decoded.complete,
  };
};

/**
 * Fetches the locate ego-graph for the entity named by `atlasId`: the source,
 * the partners of its delivered edges, and every edge incident to it, each
 * hydrated with detail (unless {@link FetchLocateOptions.includeDetailedData}
 * opts out).
 *
 * @returns The delivered nodes (source first, partners ascending wire row id)
 *   and edges (ascending wire edge id), with wire positions mapped to world
 *   coordinates, plus the source's fly-to target and a `complete` flag
 *   (`false` when the edge cap truncated; `edges: []` with `complete: true`
 *   is an unlinked source, not an error).
 * @throws {@link FetchTileError} when the request fails or is rejected
 *   (including `unknown-entity`), or the payload fails to decode or does not
 *   belong to the active generation.
 */
export const fetchLocate = async (
  atlasId: number,
  options: FetchLocateOptions = {},
): Promise<LocatedEntity> => {
  const {
    baseUrl = ATLAS_API_BASE_URL,
    signal,
    retry,
    coloredTypeIds = [],
    includeDetailedData = true,
  } = options;

  const session = await getSaltileSession(baseUrl);
  try {
    return await fetchAndDecodeLocate(
      session,
      atlasId,
      baseUrl,
      signal,
      retry,
      coloredTypeIds,
      includeDetailedData,
    );
  } catch (error) {
    // A 404 on a well-formed request usually means the pinned generation
    // rotated; re-bootstrap once and retry. (An `unknown-entity` 404 survives
    // the retry and re-throws.)
    if (error instanceof FetchTileError && error.status === 404) {
      clearAtlasSessionCache(baseUrl);
      const refreshed = await getSaltileSession(baseUrl);
      return await fetchAndDecodeLocate(
        refreshed,
        atlasId,
        baseUrl,
        signal,
        retry,
        coloredTypeIds,
        includeDetailedData,
      );
    }
    throw error;
  }
};
