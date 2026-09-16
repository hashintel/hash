/**
 * Fetches one Atlas "locate" spotlight subgraph over the SALTILE wire and
 * decodes it into renderable node/edge records.
 *
 * `POST /atlas/locate/{generation}/{variant}` resolves a source entity to
 * its dot and answers its **ego-graph**: the source is delivered first,
 * followed by the delivered edges' partners (both directions, ascending wire
 * row id), with every edge incident to the source riding the edge columns
 * (ascending link-entity identity bytes, a self-loop exactly once). When the edge cap
 * truncates, edges whose partners lie nearest the source are kept and
 * `complete` reads `false`; zero edges with `complete: true` is the honest
 * answer for an unlinked source. Locate is the detail view: the trailer is
 * always present, every delivered node carries a label and a type reference,
 * the source carries its capped simple-value properties (neighbour detail is
 * one locate away), and every delivered edge carries its link-entity
 * identity, label, type references, and capped properties with per-edge
 * completeness verdicts.
 *
 * The flow mirrors {@link fetchTile}: it shares the memoized
 * {@link getSaltileSession} (so locate binds to the same generation as the
 * viewport's tiles), POSTs the request, decodes the `SALTILEL` envelope with
 * {@link LocateDocument.decode}, and maps wire-frame positions onto the layer's
 * world exactly as the tile transport does. Transient failures retry with
 * backoff, and the two failures that end a session replace it once and retry, as
 * in {@link fetchTile}: a `404`, meaning the pinned generation is no longer
 * served, and an authority renewal the server refuses (see
 * {@link canReplaceAtlasSession}, which also decides whether this caller is
 * still the one entitled to replace it). A locate `404` may instead be
 * `unknown-entity` — the retry then re-throws it.
 *
 * ## Source id
 *
 * The request names its source in exactly one of two domains: `entityId` (an
 * upstream identity a search result or deep link carries) or `row` (the wire
 * node/edge row id a rendered tile put in the client's hand). {@link fetchLocate}
 * takes either: a `number` is the **atlas id** and rides the `row` field (what a
 * rendered node or edge holds), while a `{ entityId }` rides the `entityId` field
 * (what a search result holds — it has no atlas row id to hand). The same source
 * yields a byte-identical response through either domain.
 */

import * as Decoder from "../atlas-decode/Decoder";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/Envelope";
import * as Function from "../atlas-decode/Function";
import * as Iterable from "../atlas-decode/Iterable";
import * as LocateDocument from "../atlas-decode/LocateDocument";
import * as Option from "../atlas-decode/Option";
import * as Record from "../atlas-decode/Record";
import * as Result from "../atlas-decode/Result";
import { WORLD_SIZE } from "./atlas-tile-coordinate";
import {
  ATLAS_API_BASE_URL,
  FetchTileError,
  requestAtlas,
  withAtlasSession,
  type SaltileSession,
} from "./fetch-tile";

import type * as Num from "../atlas-decode/Num";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/**
 * Names a locate source in one of the endpoint's two domains: a wire node/edge
 * row id (`number`, sent as `row`), or an upstream entity id (sent as
 * `entityId`). A search result carries the latter, with no atlas row id to hand.
 */
export type LocateSource = number | { readonly entityId: EntityId };

/** One located node: a row id, world coordinates, and detail hydration. */
export interface LocateNode {
  /** Node wire row id — matches a tile node's id within this generation. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Human-readable label; `undefined` when the label did not resolve. */
  readonly label?: string;
  /**
   * The node's representative type as a versioned URL.
   *
   * `undefined` marks a node the store no longer serves or records no
   * types for. Label and icon rendering for a type is the client's own
   * metadata.
   */
  readonly typeId?: VersionedUrl;
  /** Matched indices into {@link FetchLocateOptions.coloredTypeIds}, in request order. */
  readonly typeIndices?: readonly number[];
  /**
   * The source's capped simple-value properties keyed by property base URL.
   *
   * `null` marks a store-absent source; `undefined` a neighbour
   * (neighbour detail is one locate away).
   */
  readonly properties?: LocateDocument.Properties | null;
}

/** One located edge: its link-entity identity, endpoints, and hydration. */
export interface LocateEdge {
  /**
   * The link entity's upstream identity.
   *
   * The identity is the edge's identity on every binary surface and is
   * stable across generations.
   */
  readonly id: EntityId;
  /** Source node row id — matches a {@link LocateNode.id}. */
  readonly source: number;
  /** Target node row id — matches a {@link LocateNode.id}. */
  readonly target: number;
  /** Link-entity label; `undefined` when it did not resolve. */
  readonly label?: string;
  /** The link's direct types as versioned URLs, in wire order, capped. */
  readonly typeIds: readonly VersionedUrl[];
  /** Whether {@link typeIds} is the link's whole direct set. */
  readonly typeIdsComplete: boolean;
  /** The link's capped simple properties; `null` marks a store-absent link. */
  readonly properties: LocateDocument.Properties | null;
  /** Whether {@link properties} is the link entity's whole set. */
  readonly propertiesComplete: boolean;
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
  /** The source's upstream entity identity. */
  readonly entityId: EntityId;
  /** The source (index 0) followed by its partners (ascending wire row id). */
  readonly nodes: LocateNode[];
  /** The edges incident to the source (ascending identity bytes). */
  readonly edges: LocateEdge[];
  /** The source's first visible zoom and its tile there — a fly-to target. */
  readonly cell: LocateDocument.Cell;
  readonly zoom: Num.u64;
  /** False when the locate edge cap truncated the subgraph. */
  readonly complete: boolean;
  /** The request's coloredTypeIds cover every direct type of the source. */
  readonly typeIdsComplete: boolean;
  /** The source's property map is the entity's whole set. */
  readonly propertiesComplete: boolean;
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
  readonly coloredTypeIds?: readonly VersionedUrl[];
}

/** The locate route for a session; the variant name addresses it, as for tiles. */
const locateUrl = (session: SaltileSession, baseUrl: string): string =>
  `${baseUrl}/locate/${session.generation}/${session.variant}`;

/** The JSON body: the source in its domain, plus the delivery knobs when non-default. */
const locateBody = (
  source: LocateSource,
  coloredTypeIds: readonly VersionedUrl[],
): string =>
  JSON.stringify({
    // Exactly one source domain rides the body: a wire row id via `row`, or an
    // upstream identity via `entityId`.
    ...(typeof source === "number"
      ? { row: source }
      : { entityId: source.entityId }),
    ...(coloredTypeIds.length > 0 ? { coloredTypeIds } : {}),
  });

const fetchAndDecodeLocate = async (
  session: SaltileSession,
  requestSource: LocateSource,
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  coloredTypeIds: readonly VersionedUrl[],
): Promise<LocatedEntity> => {
  const response = await requestAtlas(
    locateUrl(session, baseUrl),
    SALTILE_MEDIA_TYPE,
    locateBody(requestSource, coloredTypeIds),
    signal,
    retries,
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(SALTILE_MEDIA_TYPE)) {
    throw new FetchTileError(
      `locate arrived as ${contentType}; expected ${SALTILE_MEDIA_TYPE}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const decoder = new Decoder.Decoder(new DataView(buffer));

  // Wire frame [-1, 1] onto the layer's world [0, WORLD_SIZE): an exact
  // power-of-two scale, as in the tile transport.
  const scale = WORLD_SIZE / 2;

  const {
    positions,
    rowIds,
    typeMask,
    sources,
    targets,
    edgeIds,
    trailer,
    entityId,
    cell,
    zoom,
    complete,
    typeIdsComplete: sourceTypeIdsComplete,
    propertiesComplete: sourcePropertiesComplete,
  } = LocateDocument.decode(decoder, {
    generation: session.generation,
    variant: session.variantIndex,
    coloredTypeCount: coloredTypeIds.length,
  }).pipe(
    Result.changeContext(() => new FetchTileError("failed to decode locate")),
    Result.unwrap,
  );

  const nodes = Function.pipe(
    [
      rowIds,
      positions,
      Option.unwrapOrElse(typeMask, () => Iterable.repeat(null)),
      trailer.labels,
      trailer.typeIds,
    ],
    Function.spread(Iterable.zip),
    Iterable.map(
      ([rowId, [x, y], mask, label, typeId], index): LocateNode =>
        Record.omitUndefined({
          id: rowId,
          x: (x + 1) * scale,
          y: (y + 1) * scale,
          typeIndices: mask ? [...mask] : undefined,
          label: label ?? undefined,
          typeId: typeId ?? undefined,
          properties: index === 0 ? trailer.properties : undefined,
        }),
    ),
    Iterable.collect(),
  );

  const edges = Function.pipe(
    [
      edgeIds,
      sources,
      targets,
      trailer.linkLabels,
      trailer.linkTypeIds,
      trailer.linkTypeIdsComplete,
      trailer.linkProperties,
      trailer.linkPropertiesComplete,
    ],
    Function.spread(Iterable.zip),
    Iterable.map(
      ([
        edgeId,
        source,
        target,
        label,
        typeIds,
        typeIdsComplete,
        properties,
        propertiesComplete,
      ]): LocateEdge =>
        Record.omitUndefined({
          id: edgeId.toString(),
          source,
          target,
          label: label ?? undefined,
          typeIds,
          typeIdsComplete,
          properties,
          propertiesComplete,
        }),
    ),
    Iterable.collect(),
  );

  return {
    entityId: entityId.toString(),
    nodes,
    edges,
    cell,
    zoom,
    complete,
    typeIdsComplete: sourceTypeIdsComplete,
    propertiesComplete: sourcePropertiesComplete,
  };
};

/**
 * Fetches the locate ego-graph for the entity named by `source`: the source,
 * the partners of its delivered edges, and every edge incident to it, always
 * hydrated with detail (locate is the detail view). `source` is either an
 * atlas row id (`number`) or a `{ entityId }` — see the module's "Source id"
 * section.
 *
 * @returns The delivered nodes (source first, partners ascending wire row id)
 *   and edges (ascending link-entity identity bytes), with wire positions mapped to world
 *   coordinates, plus the source's fly-to target and a `complete` flag
 *   (`false` when the edge cap truncated; `edges: []` with `complete: true`
 *   is an unlinked source, not an error).
 * @throws {@link FetchTileError} when the request fails or is rejected
 *   (including `unknown-entity`), or the payload fails to decode or does not
 *   belong to the active generation.
 */
export const fetchLocate = async (
  source: LocateSource,
  options: FetchLocateOptions = {},
): Promise<LocatedEntity> => {
  const {
    baseUrl = ATLAS_API_BASE_URL,
    signal,
    retry,
    coloredTypeIds = [],
  } = options;

  // An `unknown-entity` refusal is a `404` too, so it reaches the session's replacement decision;
  // what saves it from re-bootstrapping the session is that the entity is still unknown to the
  // successor, so the second attempt refuses the same way and that refusal is what travels.
  return withAtlasSession(baseUrl, (session) =>
    fetchAndDecodeLocate(
      session,
      source,
      baseUrl,
      signal,
      retry,
      coloredTypeIds,
    ),
  );
};
