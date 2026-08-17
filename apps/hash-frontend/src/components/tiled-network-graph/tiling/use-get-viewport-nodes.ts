/**
 * Viewport-driven tiling for the Atlas network graph.
 *
 * {@link getViewportNodes} turns a camera viewport into the set of nodes that
 * should be on screen — and the edges among them. It fetches the quadtree tiles
 * the viewport covers (plus their ancestors — see below), serving them from a
 * {@link TileCache} and only hitting the network for tiles it has never seen,
 * then fetches the edges among those tiles' nodes (see the "Edges" note). The
 * spatial geometry lives in `./tile-geometry`, the edge transport in
 * `./fetch-edges-for-tiles`, and the speculative prefetch in `./tile-prefetch`.
 *
 * ## Coordinate model
 *
 * World space is the Atlas global 16-bit axis, `[0, {@link WORLD_SIZE})` on
 * each axis. Node positions and the viewport rectangle live in this space. At
 * quadtree depth `z` the world is a `2 ** z` by `2 ** z` grid of tiles, each
 * spanning `WORLD_SIZE / 2 ** z` units.
 *
 * ## Zoom
 *
 * `viewport.zoom` is a continuous (fractional) quadtree depth, matching the
 * slippy-map convention where map zoom and tile zoom share a scale. Between
 * integer levels we snap to the nearest one (`Math.round`, ties toward the more
 * detailed level) and clamp to `[0, ATLAS_TILE_MAX_ZOOM]`. The viewport
 * rectangle then selects which tiles at that depth are on screen.
 *
 * ## Descent
 *
 * Tiles are a level-of-detail pyramid: a tile carries a spatially fair sample of
 * its subtree's points (distinct from the samples its ancestors carry) plus a
 * `complete` flag, set once it has delivered *every* point beneath it. So the
 * node set for a region is the union of a "cut" through the quadtree — shallow
 * where the server already delivered a subtree whole, deep where dense clusters
 * still have undelivered points.
 *
 * {@link getViewportNodes} finds that cut by a completeness-pruned descent: it
 * fetches the tiles covering the viewport depth by depth, steps into a tile's
 * children only when the tile came back incomplete, and stops at the viewport's
 * target depth. Sparse regions terminate early (few fetches); dense clusters walk
 * to the finest depth, so the individual nodes the quadtree bucketed deep are
 * fetched exactly where they exist. Ancestors are rendered alongside their
 * descendants — their samples are disjoint, so the union refines in progressively
 * as deeper tiles land rather than leaving grid-shaped gaps.
 *
 * The cache's eviction distance keeps a viewport's whole descent resident (an
 * ancestor's world rectangle contains the viewport, so its spatial distance is
 * zero), and every descended tile is pinned for the duration of the call.
 *
 * ## Edges
 *
 * After the node descent, {@link getViewportNodes} fetches the edges among the
 * tiles it delivered nodes for. The edges API takes one tile list and returns
 * every edge whose both endpoints fall in those tiles' delivered rows, so one
 * request yields the intra-tile edges *and* the inter-tile edges crossing
 * between any two tiles.
 *
 * For minimal requests, the {@link TileCache} caches that result decomposed
 * into buckets keyed by a single node tile (its intra-tile edges) or an unordered
 * pair of node tiles (the edges crossing between them). The edge an endpoint
 * pair produces is placed by mapping each endpoint's node id back to the tile
 * that delivered it. Buckets share the node cache's byte budget and distance
 * eviction; a pair bucket is additionally evicted when either endpoint tile
 * leaves the node cache, since edges touching an evicted tile can no longer be
 * drawn. Auxiliary edge detail is request-time data and bypasses residency.
 *
 * ## Sessions and generations
 *
 * The atlas serves exactly one generation per process, pinned at its startup: the
 * `current` route echoes it, and every other route answers `404` for any other
 * generation id. So the tiles of one session are one generation *by
 * construction* — nothing changes generation mid-request, or under a running
 * server.
 *
 * What can be replaced under a running view is the session itself, and the
 * transport publishes `getAtlasSessionRevision` for exactly that: a change to it
 * constructs a *new* {@link TileCache} and discards the nodes on screen (see
 * {@link useGetViewportNodes}). Three things replace a session, and only the
 * first moves the generation.
 *
 * A session can outlive the process it bootstrapped against. A view open across an
 * atlas restart or redeploy (or reaching a second replica that serves a different
 * generation) finds its pinned generation no longer served, and the transport's
 * one-shot `404` refresh re-pins it to whatever `current` now names. The tiles
 * resident at that moment belong to the retired generation, and they are not stale
 * but *misattributed*: wire row ids are a keyed permutation salted by the
 * generation identity, so an old id decoded under the new generation names a
 * different, existing entity — valid to every consumer, and wrong. No remap
 * exists.
 *
 * A session's authority can also be refused at its own renewal, and the
 * authenticated principal can change. Both replace the session with the
 * generation standing still, and both are attribution boundaries for the same
 * reason in a different currency: the successor session answers for a different
 * view or a different actor, so the rows its predecessor delivered are not the
 * rows it would deliver. Resident tiles are discarded on every one of the three,
 * because no consumer can tell a re-attributed id from a correct one.
 *
 * ## Request state
 *
 * {@link useGetViewportNodes} wraps the fetch in {@link useAtlasQuery} — a
 * small, dependency-free async state machine (TanStack-Query-shaped: `data` /
 * `error` / `isLoading` / ...) for code that already owns its caching (the
 * {@link TileCache}) and wants only the request *state machine*, not a second
 * cache.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { SaltileDetail } from "../atlas-decode/wire";
import {
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import {
  fetchEdgesForTiles,
  type FetchedEdges,
  type TileEdge,
} from "./fetch-edges-for-tiles";
import {
  ATLAS_API_BASE_URL,
  fetchTile,
  type FetchedTile,
  getAtlasSessionRevision,
  getAtlasTileMaxZoom,
  setAtlasViewFilter,
  subscribeToAtlasSessionRevision,
  subscribeToAtlasTileMaxZoom,
  type TileNode,
} from "./fetch-tile";
import {
  childCoordinates,
  clampRectToWorld,
  tileDistance,
  tileIndexOf,
  tileIntersectsRect,
  tileZoomForViewport,
  WORLD_SIZE,
  type Rect,
  type ViewportRegion,
} from "./tile-geometry";
import { HISTORY_LENGTH, schedulePrefetch } from "./tile-prefetch";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

export { tileZoomForViewport, WORLD_SIZE } from "./tile-geometry";

/**
 * Tile depth used for a `null` (freshly loaded) viewport: the first level that
 * subdivides the map. Walking its ancestor stack yields the four depth-1
 * quadrant tiles plus their shared depth-0 root — the initial overview.
 */
const INITIAL_TILE_ZOOM = 1;

/**
 * Safety bound on the tiles fetched at one descent depth. Curve-driven viewports
 * keep a depth's viewport cover far below this (a few hundred at the deepest
 * zoom); it only guards a malformed viewport — e.g. the whole world at a deep
 * target depth — from enumerating an entire grid level.
 */
const MAX_DESCENT_FRONTIER = 1024;

/**
 * Default cache budget. The ~256 fully-delivered node tiles this once targeted
 * (64 MiB) was a node-only figure; minimal edge buckets share the same pool
 * (see the "Edges" note), so 128 MiB preserves room for geometry from both
 * routes. Tunable per instance for dense graphs; see {@link maxBytes}.
 */
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

/**
 * Rough heap cost of one cached node. Only used to compare tiles against the
 * byte budget, not for exact accounting: a small `{ id, x, y }` object plus its
 * slot is on this order in V8.
 */
const APPROX_BYTES_PER_NODE = 64;

/** Baseline cost of a cached tile independent of its node count. */
const APPROX_BYTES_PER_TILE = 256;

/** Rough heap cost of one cached edge; see {@link APPROX_BYTES_PER_NODE}. */
const APPROX_BYTES_PER_EDGE = 64;

/** Baseline cost of a cached edge bucket independent of its edge count. */
const APPROX_BYTES_PER_EDGE_BUCKET = 128;

/**
 * Stable empty default for `coloredTypeIds`. Since the option is a cache-identity
 * input (a memo dependency), a fresh `[]` each render would recreate the cache
 * every render; one shared frozen array keeps the identity constant.
 */
const EMPTY_COLORED_TYPE_IDS: readonly string[] = Object.freeze([]);

/** A camera viewport: a world rectangle plus a fractional quadtree depth. */
export interface Viewport extends Rect {
  /** Fractional quadtree depth; see the module's "Zoom" note. */
  readonly zoom: number;
}

/** One node as returned to the renderer. */
export interface ViewportNode {
  readonly id: number | string;
  readonly x: number;
  readonly y: number;
  /**
   * Human-readable label, carried only for tiles fetched with
   * `detail: "auxiliary"` (the detailed view; see {@link getViewportNodes}).
   * `undefined` otherwise.
   */
  readonly label?: string;
  /**
   * The entity's icon (emoji or `/path`/`https` URL), carried alongside
   * {@link label} for detailed tiles. `undefined` otherwise.
   */
  readonly icon?: string;
  /**
   * Indices into the request's {@link UseGetViewportNodesOptions.coloredTypeIds}
   * this node carries (see {@link TileNode.typeIndices}). Present only when
   * colored types were requested; empty when the node matches none of them.
   */
  readonly typeIndices?: readonly number[];
}

/** One edge as returned to the renderer: its id and the node ids it connects. */
export interface ViewportEdge {
  /** The link entity's upstream identity. */
  readonly id: EntityId;
  readonly source: number;
  readonly target: number;
  /**
   * Link-entity label, carried only for edges fetched with
   * `detail: "auxiliary"` (see {@link UseGetViewportNodesOptions.detail}).
   * `undefined` otherwise.
   */
  readonly label?: string;
  /**
   * The link's representative type as a versioned URL, carried alongside
   * {@link label} for detailed edges. Label and icon rendering for the type is
   * the client's own metadata. `undefined` otherwise.
   */
  readonly typeId?: VersionedUrl;
}

/** The renderable graph for a viewport: its nodes and the edges among them. */
export interface ViewportGraph {
  readonly nodes: ViewportNode[];
  readonly edges: ViewportEdge[];
}

/** Per-request controls the cache threads to a {@link TileFetcher}. */
export interface TileFetchControls {
  /**
   * Relative network priority; the cache passes `"low"` for a speculative
   * prefetch so required loads win the connection's bandwidth.
   */
  readonly priority?: "high" | "low";
  /** Aborts a superseded prefetch (required loads are never given a signal). */
  readonly signal?: AbortSignal;
  /**
   * The request's `detail` mode: `"auxiliary"` requests the tile's detail
   * trailer so delivered nodes carry a `label`; see
   * {@link FetchTileOptions.detail}. The cache sets this per load from the
   * viewport's detail mode.
   */
  readonly detail?: SaltileDetail;
}

/** Fetches one tile — its nodes plus completeness — addressed as `fetchTile` does. */
export type TileFetcher = (
  zoom: number,
  tileIndex: number,
  controls?: TileFetchControls,
) => Promise<FetchedTile>;

/**
 * Fetches all edges among a set of tiles — intra-tile and inter-tile together —
 * in one call, as {@link fetchEdgesForTiles} does.
 */
export type EdgesFetcher = (
  tiles: readonly AtlasTileCoordinate[],
  controls?: TileFetchControls,
) => Promise<FetchedEdges>;

/** Construction options for {@link TileCache}. */
export interface TileCacheOptions {
  /** Soft memory budget in bytes before eviction runs. */
  readonly maxBytes?: number;
  /** Tile fetcher; defaults to {@link fetchTile}. Injectable for tests. */
  readonly fetcher?: TileFetcher;
  /** Edges fetcher; defaults to {@link fetchEdgesForTiles}. Injectable for tests. */
  readonly edgesFetcher?: EdgesFetcher;
}

/** Every tile fetch for a viewport failed. */
export class ViewportTilesError extends Error {
  override readonly name = "ViewportTilesError";
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const validateViewport = (viewport: Viewport): void => {
  const fields: ReadonlyArray<readonly [string, number]> = [
    ["x1", viewport.x1],
    ["x2", viewport.x2],
    ["y1", viewport.y1],
    ["y2", viewport.y2],
    ["zoom", viewport.zoom],
  ];
  for (const [name, value] of fields) {
    if (!isFiniteNumber(value)) {
      throw new ViewportTilesError(
        `viewport.${name} must be a finite number, got ${String(value)}`,
      );
    }
  }
};

/** Whether a cached tile arrived because a viewport required it, or ahead of need. */
type TileOrigin = "required" | "prefetch";

/**
 * Whether an in-flight fetch at `have` satisfies a load wanting `want`.
 *
 * An auxiliary response is a superset of the minimal one, so one in-flight
 * request serves both modes. Completed auxiliary detail is not cache-resident;
 * {@link TileCache.load} refetches it when a later load asks for detail.
 */
const inFlightDetailServes = (
  have: SaltileDetail,
  want: SaltileDetail,
): boolean =>
  have === SaltileDetail.Auxiliary || want === SaltileDetail.Minimal;

interface CacheEntry {
  readonly coordinate: AtlasTileCoordinate;
  readonly nodes: readonly TileNode[];
  /** Whether the tile delivered its whole subtree; drives the descent's pruning. */
  readonly complete: boolean;
  readonly bytes: number;
  readonly origin: TileOrigin;
  /** A prefetch-origin tile that a later required load has since claimed. */
  used: boolean;
}

/** An in-flight tile fetch plus the detail mode it will deliver. */
interface InflightFetch {
  /** The `detail` mode the pending fetch requested. */
  readonly detail: SaltileDetail;
  /** The abort signal owned by a prefetch, absent for a required load. */
  readonly signal: AbortSignal | undefined;
  readonly promise: Promise<readonly TileNode[]>;
}

/** Prefetch effectiveness counters accumulated over a {@link TileCache}'s life. */
export interface PrefetchStats {
  /** Prefetch fetches started (tiles pulled ahead of need). */
  readonly issued: number;
  /** Started prefetches aborted before completing because the viewport moved on. */
  readonly cancelled: number;
  /** Prefetched tiles a later viewport required before eviction (hits). */
  readonly used: number;
  /** Prefetched tiles evicted before any viewport required them. */
  readonly wasted: number;
  /** Prefetched tiles still resident but not yet required. */
  readonly residentUnused: number;
  /** Required tiles fetched cold — neither cached nor prefetched in time. */
  readonly requiredColdMiss: number;
  /** `used / (issued - cancelled)`: of completed prefetches, the fraction that paid off. */
  readonly precision: number;
  /** `used / (used + requiredColdMiss)`: first-need tiles prefetch had ready. */
  readonly coverage: number;
}

const estimateBytes = (nodes: readonly TileNode[]): number =>
  APPROX_BYTES_PER_TILE + nodes.length * APPROX_BYTES_PER_NODE;

const estimateEdgeBytes = (edges: readonly TileEdge[]): number =>
  APPROX_BYTES_PER_EDGE_BUCKET + edges.length * APPROX_BYTES_PER_EDGE;

/**
 * A cached set of edges keyed by one node tile (its intra-tile edges) or an
 * unordered pair of node tiles (the edges crossing between them).
 */
interface EdgeCacheEntry {
  /** The one or two node tiles this bucket's edges connect. */
  readonly tiles: readonly AtlasTileCoordinate[];
  readonly edges: readonly TileEdge[];
  readonly bytes: number;
}

/**
 * Cache key for an edge bucket: a single node tile's key for its intra-tile
 * edges, or the two tiles' keys joined (order-normalized) for the edges crossing
 * between them. The single-tile form deliberately equals {@link atlasTileKey},
 * so pinning a node tile also pins its intra-tile edges.
 */
const edgeBucketKey = (
  a: AtlasTileCoordinate,
  b: AtlasTileCoordinate,
): string => {
  const keyA = atlasTileKey(a);
  const keyB = atlasTileKey(b);
  if (keyA === keyB) {
    return keyA;
  }
  return keyA < keyB ? `${keyA}~${keyB}` : `${keyB}~${keyA}`;
};

/**
 * A distance-evicting, in-flight-deduplicating store of decoded tiles plus the
 * recent-viewport history that drives prefetching. Satisfies the
 * `PrefetchCache` slice that {@link schedulePrefetch} reads and drives.
 *
 * Callers construct one and pass it to {@link getViewportNodes} across renders
 * so tiles (and movement history) persist. When it exceeds its byte budget it
 * evicts the tiles furthest from the current viewport in the 3-D
 * `tileDistance` metric, never evicting a tile the current viewport requires.
 */
export class TileCache {
  readonly maxBytes: number;

  readonly #fetcher: TileFetcher;
  readonly #edgeFetcher: EdgesFetcher;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #edgeEntries = new Map<string, EdgeCacheEntry>();
  /** Node tile key → the edge bucket keys touching it, for cascade eviction. */
  readonly #edgeKeysByTile = new Map<string, Set<string>>();
  readonly #inflight = new Map<string, InflightFetch>();
  readonly #prefetchControllers = new Map<string, AbortController>();
  readonly #history: ViewportRegion[] = [];
  readonly #pinned = new Set<string>();

  /** Tile-set signature the resident edge buckets were last assembled for. */
  #edgeSignature: string | null = null;
  /** Non-empty edge bucket keys backing {@link #edgeSignature}. */
  #edgeBucketKeys: ReadonlySet<string> = new Set<string>();

  #bytes = 0;
  #viewport: ViewportRegion | null = null;
  #prefetchIssued = 0;
  #prefetchCancelled = 0;
  #prefetchUsed = 0;
  #prefetchWasted = 0;
  #requiredColdMiss = 0;

  constructor(options: TileCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!(this.maxBytes > 0)) {
      throw new ViewportTilesError(
        `TileCache maxBytes must be positive, got ${String(this.maxBytes)}`,
      );
    }
    this.#fetcher = options.fetcher ?? fetchTile;
    this.#edgeFetcher = options.edgesFetcher ?? fetchEdgesForTiles;
  }

  /** Number of tiles currently resident. */
  get tileCount(): number {
    return this.#entries.size;
  }

  /** Number of edge buckets currently resident. */
  get edgeBucketCount(): number {
    return this.#edgeEntries.size;
  }

  /** Estimated bytes currently resident. */
  get byteEstimate(): number {
    return this.#bytes;
  }

  /** Fraction of the byte budget in use, clamped to `[0, 1]`. */
  get fullness(): number {
    return Math.min(this.#bytes / this.maxBytes, 1);
  }

  /** Prefetch effectiveness accumulated over this cache's lifetime. */
  get prefetchStats(): PrefetchStats {
    let residentUnused = 0;
    for (const entry of this.#entries.values()) {
      if (entry.origin === "prefetch" && !entry.used) {
        residentUnused += 1;
      }
    }
    const issued = this.#prefetchIssued;
    const cancelled = this.#prefetchCancelled;
    const used = this.#prefetchUsed;
    const completed = issued - cancelled;
    const coldTotal = used + this.#requiredColdMiss;
    return {
      issued,
      cancelled,
      used,
      wasted: this.#prefetchWasted,
      residentUnused,
      requiredColdMiss: this.#requiredColdMiss,
      precision: completed <= 0 ? 0 : used / completed,
      coverage: coldTotal === 0 ? 0 : used / coldTotal,
    };
  }

  has(coordinate: AtlasTileCoordinate): boolean {
    return this.#entries.has(atlasTileKey(coordinate));
  }

  /**
   * The stored completeness flag for a resident tile, or `undefined` if the tile
   * is not resident. The descent reads this right after a load to decide whether
   * to step into the tile's children (only incomplete tiles are descended).
   */
  completeOf(coordinate: AtlasTileCoordinate): boolean | undefined {
    return this.#entries.get(atlasTileKey(coordinate))?.complete;
  }

  /** Recent viewports, oldest first. */
  get history(): readonly ViewportRegion[] {
    return this.#history;
  }

  /**
   * Records the viewport a fetch is servicing so eviction distances are measured
   * against it, clearing the previous pins. Any `requiredKeys` are pinned
   * immediately; a descent that discovers its tiles progressively pins them with
   * {@link pin} as it goes.
   */
  setActiveViewport(
    rect: Rect,
    depth: number,
    requiredKeys?: ReadonlySet<string>,
  ): void {
    this.#viewport = { rect, depth };
    this.#pinned.clear();
    if (requiredKeys) {
      for (const key of requiredKeys) {
        this.#pinned.add(key);
      }
    }
  }

  /** Pins tiles against eviction without clearing existing pins. */
  pin(keys: Iterable<string>): void {
    for (const key of keys) {
      this.#pinned.add(key);
    }
  }

  /** Appends a viewport to the bounded movement history. */
  recordHistory(rect: Rect, depth: number): void {
    this.#history.push({ rect, depth });
    if (this.#history.length > HISTORY_LENGTH) {
      this.#history.shift();
    }
  }

  /**
   * Returns the tile's nodes, fetching and caching on a miss. Concurrent
   * requests for the same tile share one in-flight fetch.
   *
   * `detail: "auxiliary"` requests ephemeral labels. A resident entry serves
   * only minimal loads. An in-flight auxiliary fetch can also serve a minimal
   * load, but completed auxiliary detail is not retained in the geometry cache.
   */
  async load(
    coordinate: AtlasTileCoordinate,
    detail: SaltileDetail = SaltileDetail.Minimal,
  ): Promise<readonly TileNode[]> {
    const key = atlasTileKey(coordinate);
    const cached = this.#entries.get(key);
    if (cached && detail === SaltileDetail.Minimal) {
      // A required load landing on a prefetched tile is the prefetch paying off.
      if (cached.origin === "prefetch" && !cached.used) {
        cached.used = true;
        this.#prefetchUsed += 1;
      }
      return cached.nodes;
    }
    const inFlight = this.#inflight.get(key);
    if (inFlight && inFlightDetailServes(inFlight.detail, detail)) {
      // A required load riding an in-flight prefetch claims it: a later batch
      // must not abort a fetch this viewport now depends on, and the prefetch
      // counts as a hit once it lands (marked when it settles, since the tile
      // stores only after this shared promise has already returned).
      if (
        inFlight.signal !== undefined &&
        this.#prefetchControllers.get(key)?.signal === inFlight.signal
      ) {
        this.#prefetchControllers.delete(key);
      }
      void inFlight.promise.then(
        () => this.#markUsed(key),
        () => {},
      );
      return inFlight.promise;
    }
    // A cold miss, or an auxiliary load over cache-resident geometry: fetch the
    // requested form. Auxiliary detail remains ephemeral when it lands.
    this.#requiredColdMiss += 1;
    return this.#fetch(key, coordinate, "required", detail);
  }

  /**
   * Returns the edges among `tiles` — the edges within each tile and the edges
   * crossing between any two of them — fetching and bucketing on a miss.
   *
   * Minimal edges are cached in per-tile and per-tile-pair buckets (see
   * {@link edgeBucketKey}) so a repeated tile set can reuse its geometry.
   * Auxiliary edge detail is ephemeral and always refetched. `tiles` must be
   * resident node tiles (the caller loads them first): their delivered nodes map
   * each edge endpoint back to the tile that carries it. Pass them in priority
   * order — the transport trims the list to the served `edgesTiles` cap.
   */
  async loadEdges(
    tiles: readonly AtlasTileCoordinate[],
    detail: SaltileDetail = SaltileDetail.Minimal,
  ): Promise<ViewportEdge[]> {
    if (tiles.length === 0) {
      return [];
    }
    const signature = tiles.map(atlasTileKey).sort().join(",");

    // Fast path: only minimal edge geometry is cache-resident. Auxiliary detail
    // always crosses the request-time store seam again.
    if (detail === SaltileDetail.Minimal) {
      if (
        signature === this.#edgeSignature &&
        [...this.#edgeBucketKeys].every((key) => this.#edgeEntries.has(key))
      ) {
        this.pin(this.#edgeBucketKeys);
        return this.#assembleEdges(this.#edgeBucketKeys);
      }
    } else {
      return (
        await this.#edgeFetcher(tiles, {
          priority: "high",
          detail,
        })
      ).edges;
    }

    // Map each delivered node id to the tile that carries it, so an edge's
    // endpoints resolve to the bucket (single tile, or tile pair) it belongs to.
    const nodeToTile = new Map<number | string, AtlasTileCoordinate>();
    for (const tile of tiles) {
      const entry = this.#entries.get(atlasTileKey(tile));
      if (!entry) {
        continue;
      }
      for (const node of entry.nodes) {
        nodeToTile.set(node.id, tile);
      }
    }

    const fetched = await this.#edgeFetcher(tiles, {
      priority: "high",
      detail: SaltileDetail.Minimal,
    });

    // Bucket the flat edge list by its endpoints' tiles.
    const buckets = new Map<
      string,
      { readonly tiles: AtlasTileCoordinate[]; readonly edges: TileEdge[] }
    >();
    for (const edge of fetched.edges) {
      const sourceTile = nodeToTile.get(edge.source);
      const targetTile = nodeToTile.get(edge.target);
      // Defensive: the server only ships edges within the delivered union, so an
      // endpoint should always resolve; drop any that somehow does not.
      if (sourceTile === undefined || targetTile === undefined) {
        continue;
      }
      const key = edgeBucketKey(sourceTile, targetTile);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          tiles:
            atlasTileKey(sourceTile) === atlasTileKey(targetTile)
              ? [sourceTile]
              : [sourceTile, targetTile],
          edges: [],
        };
        buckets.set(key, bucket);
      }
      bucket.edges.push(edge);
    }

    const bucketKeys = new Set(buckets.keys());
    for (const [key, bucket] of buckets) {
      this.#storeEdgeBucket(key, bucket.tiles, bucket.edges);
    }
    this.#edgeSignature = signature;
    this.#edgeBucketKeys = bucketKeys;
    // Pin before eviction so the just-stored buckets survive a tight budget.
    this.pin(bucketKeys);
    this.#evict();
    return this.#assembleEdges(bucketKeys);
  }

  /** Concatenates the edges of the named buckets; buckets are disjoint (no dedup). */
  #assembleEdges(keys: ReadonlySet<string>): ViewportEdge[] {
    const edges: ViewportEdge[] = [];
    for (const key of keys) {
      const entry = this.#edgeEntries.get(key);
      if (entry) {
        edges.push(...entry.edges);
      }
    }
    return edges;
  }

  /**
   * Issues the batch of speculative prefetches for the current viewport, and
   * cancels any still-in-flight prefetch this batch no longer wants — superseded
   * speculation whose bytes are better spent on the current viewport (and, on a
   * slow link, on the required loads it was starving). A prefetch already
   * claimed by a required load (see {@link load}) is never cancelled.
   */
  prefetchBatch(coordinates: readonly AtlasTileCoordinate[]): void {
    const wanted = new Set(coordinates.map(atlasTileKey));
    for (const [key, controller] of [...this.#prefetchControllers]) {
      if (!wanted.has(key)) {
        this.#prefetchControllers.delete(key);
        this.#prefetchCancelled += 1;
        controller.abort();
      }
    }
    for (const coordinate of coordinates) {
      this.#prefetchOne(coordinate);
    }
  }

  /**
   * Starts one low-priority, cancellable geometry prefetch; a no-op if already
   * held. Auxiliary viewports skip the prefetch scheduler because their required
   * loads cannot consume a minimal prefetch.
   */
  #prefetchOne(coordinate: AtlasTileCoordinate): void {
    const key = atlasTileKey(coordinate);
    if (this.#entries.has(key) || this.#inflight.has(key)) {
      return;
    }
    this.#prefetchIssued += 1;
    const controller = new AbortController();
    this.#prefetchControllers.set(key, controller);
    // Speculative: swallow failures (including cancellation) so a bad prediction
    // never surfaces.
    void this.#fetch(
      key,
      coordinate,
      "prefetch",
      SaltileDetail.Minimal,
      controller.signal,
    ).catch(() => undefined);
  }

  #fetch(
    key: string,
    coordinate: AtlasTileCoordinate,
    origin: TileOrigin,
    detail: SaltileDetail,
    signal?: AbortSignal,
  ): Promise<readonly TileNode[]> {
    const pending = this.#fetcher(coordinate.z, tileIndexOf(coordinate), {
      priority: origin === "prefetch" ? "low" : "high",
      signal,
      detail,
    }).then((fetched) => {
      this.#store(key, coordinate, fetched, origin);
      return fetched.nodes;
    });
    this.#inflight.set(key, { detail, signal, promise: pending });

    const removeSettled = () => {
      if (this.#inflight.get(key)?.promise === pending) {
        this.#inflight.delete(key);
      }
      if (
        signal !== undefined &&
        this.#prefetchControllers.get(key)?.signal === signal
      ) {
        this.#prefetchControllers.delete(key);
      }
    };
    void pending.then(removeSettled, removeSettled);

    return pending;
  }

  /** Resolves once all in-flight fetches (including prefetches) settle. */
  async settled(): Promise<void> {
    await Promise.allSettled(
      [...this.#inflight.values()].map((fetch) => fetch.promise),
    );
  }

  #store(
    key: string,
    coordinate: AtlasTileCoordinate,
    fetched: FetchedTile,
    origin: TileOrigin,
  ): void {
    const existing = this.#entries.get(key);
    const nodes = fetched.nodes.map(({ id, x, y, typeIndices }) => ({
      id,
      x,
      y,
      ...(typeIndices === undefined ? {} : { typeIndices }),
    }));
    if (existing) {
      this.#bytes -= existing.bytes;
    }
    const bytes = estimateBytes(nodes);
    this.#entries.set(key, {
      coordinate,
      nodes,
      complete: fetched.complete,
      bytes,
      origin,
      used: false,
    });
    this.#bytes += bytes;
    this.#evict();
  }

  /** Stores one edge bucket, updating byte use and the cascade reverse index. */
  #storeEdgeBucket(
    key: string,
    tiles: readonly AtlasTileCoordinate[],
    edges: readonly TileEdge[],
  ): void {
    const existing = this.#edgeEntries.get(key);
    if (existing) {
      this.#bytes -= existing.bytes;
    }
    const bytes = estimateEdgeBytes(edges);
    this.#edgeEntries.set(key, { tiles, edges, bytes });
    this.#bytes += bytes;
    for (const tile of tiles) {
      const tileKey = atlasTileKey(tile);
      let set = this.#edgeKeysByTile.get(tileKey);
      if (!set) {
        set = new Set<string>();
        this.#edgeKeysByTile.set(tileKey, set);
      }
      set.add(key);
    }
  }

  /**
   * Marks a resident prefetch tile as a hit. Used when a required load rode an
   * in-flight prefetch (see {@link load}): the tile stores after that load has
   * already returned the shared promise, so it can't be counted used inline.
   */
  #markUsed(key: string): void {
    const entry = this.#entries.get(key);
    if (entry && entry.origin === "prefetch" && !entry.used) {
      entry.used = true;
      this.#prefetchUsed += 1;
    }
  }

  #evict(): void {
    if (this.#bytes <= this.maxBytes) {
      return;
    }
    const viewport = this.#viewport;
    const distanceOf = (coordinate: AtlasTileCoordinate): number =>
      viewport ? tileDistance(coordinate, viewport.rect, viewport.depth) : 0;

    // Node tiles and edge buckets share the budget. Each candidate carries the
    // distance of its nearest tile — a pair bucket stays while either endpoint is
    // near — so the furthest data leaves first.
    interface Candidate {
      readonly kind: "node" | "edge";
      readonly key: string;
      readonly distance: number;
    }
    const candidates: Candidate[] = [];
    for (const [key, entry] of this.#entries) {
      if (!this.#pinned.has(key)) {
        candidates.push({
          kind: "node",
          key,
          distance: distanceOf(entry.coordinate),
        });
      }
    }
    for (const [key, entry] of this.#edgeEntries) {
      if (!this.#pinned.has(key)) {
        const distance = Math.min(...entry.tiles.map(distanceOf));
        candidates.push({ kind: "edge", key, distance });
      }
    }

    // Furthest first. With no active viewport every distance is 0, so the sort
    // leaves insertion order (nodes before edges) untouched — oldest first.
    if (viewport) {
      candidates.sort((a, b) => b.distance - a.distance);
    }
    for (const candidate of candidates) {
      if (this.#bytes <= this.maxBytes) {
        break;
      }
      if (candidate.kind === "node") {
        this.#evictNode(candidate.key);
      } else {
        this.#evictEdge(candidate.key);
      }
    }
  }

  /** Evicts one node tile, cascading to the edge buckets that touch it. */
  #evictNode(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) {
      return;
    }
    if (entry.origin === "prefetch" && !entry.used) {
      this.#prefetchWasted += 1;
    }
    this.#entries.delete(key);
    this.#bytes -= entry.bytes;
    // A bucket touching this tile is unrenderable once its nodes are gone.
    const dependent = this.#edgeKeysByTile.get(key);
    if (dependent) {
      for (const edgeKey of [...dependent]) {
        this.#evictEdge(edgeKey);
      }
    }
  }

  /** Evicts one edge bucket and detaches it from the cascade reverse index. */
  #evictEdge(key: string): void {
    const entry = this.#edgeEntries.get(key);
    if (!entry) {
      return;
    }
    this.#edgeEntries.delete(key);
    this.#bytes -= entry.bytes;
    for (const tile of entry.tiles) {
      const tileKey = atlasTileKey(tile);
      const set = this.#edgeKeysByTile.get(tileKey);
      if (set) {
        set.delete(key);
        if (set.size === 0) {
          this.#edgeKeysByTile.delete(tileKey);
        }
      }
    }
  }
}

/** Resolves a viewport (or the initial `null`) to a clamped rect and depth. */
const resolveViewport = (viewport: Viewport | null): ViewportRegion => {
  if (viewport === null) {
    return {
      rect: { x1: 0, x2: WORLD_SIZE, y1: 0, y2: WORLD_SIZE },
      depth: INITIAL_TILE_ZOOM,
    };
  }
  validateViewport(viewport);
  return {
    rect: clampRectToWorld(viewport),
    depth: tileZoomForViewport(viewport.zoom),
  };
};

/**
 * One required tile's load outcome, kept paired with its coordinate so a
 * success can be grouped under its depth without indexing a parallel array.
 */
type TileLoad =
  | {
      readonly coordinate: AtlasTileCoordinate;
      readonly nodes: readonly TileNode[];
    }
  | { readonly coordinate: AtlasTileCoordinate; readonly error: unknown };

/** Options for {@link getViewportNodes}. */
export interface GetViewportNodesOptions {
  /**
   * The descent's `detail` mode. `"auxiliary"` fetches every tile of the
   * descent with the detail trailer, so the returned nodes carry a `label`.
   * The detailed view sends it once the camera crosses its detail-zoom
   * threshold — refetching the whole descent (target tiles *and* their
   * ancestors, which render alongside) so every visible node is labelled.
   * Defaults to `"minimal"` (the geometry-only compact view).
   */
  readonly detail?: SaltileDetail;
}

/**
 * Returns the nodes visible in `viewport` and the edges among them, fetching any
 * missing tiles through `cache` by a completeness-pruned descent (see the
 * module's "Descent" note) and returning the merged, id-deduplicated result.
 *
 * A `null` viewport (a freshly mounted graph) resolves to the initial overview
 * depth. Otherwise the viewport's rectangle and zoom set the descent's target
 * depth: the descent fetches the tiles covering the rectangle depth by depth,
 * steps into a tile's children only when that tile came back incomplete, and
 * stops at the target depth — so a dense cluster is followed down to the finest
 * tiles that hold its individual nodes, while sparse regions terminate early.
 * Ancestors and descendants both render; their samples are disjoint, so nodes
 * refine in progressively as deeper tiles land rather than leaving grid gaps.
 *
 * With {@link GetViewportNodesOptions.detail} at `"auxiliary"` the whole
 * descent is fetched with the detail trailer, so every returned node —
 * ancestors included — carries its `label`. Detail remains ephemeral; later
 * detailed reads refetch it through {@link TileCache.load}.
 *
 * Once the nodes are in, it fetches the edges among the delivered tiles (see the
 * module's "Edges" note); edges are supplementary, so a failure there leaves the
 * nodes intact and returns them with no edges.
 *
 * After serving a minimal viewport it records the movement and, while the user
 * is navigating, prefetches the tiles the next viewport is predicted to need
 * (see {@link schedulePrefetch}). Auxiliary viewports do not speculate because
 * detail is never retained and a minimal prefetch cannot serve them.
 *
 * @throws {@link ViewportTilesError} when the viewport is malformed, or when
 *   every tile fetch attempted for the viewport fails (a partial failure returns
 *   what loaded).
 */
export const getViewportNodes = async (
  viewport: Viewport | null,
  cache: TileCache,
  options: GetViewportNodesOptions = {},
): Promise<ViewportGraph> => {
  const { detail = SaltileDetail.Minimal } = options;
  const { rect, depth: targetDepth } = resolveViewport(viewport);

  // Reset the eviction anchor and pins to this viewport; the descent pins each
  // tile it touches below, so a concurrent store/evict can't drop one mid-call.
  cache.setActiveViewport(rect, targetDepth);

  const nodes = new Map<number | string, ViewportNode>();
  const requiredKeys = new Set<string>();
  const loadedTiles: AtlasTileCoordinate[] = [];
  let attempted = 0;
  let failures = 0;
  let firstError: unknown;

  // Descend depth by depth from the root. `frontier` is the tiles to fetch at the
  // current depth: the rect-covering children of the previous depth's *incomplete*
  // tiles. A complete tile has delivered its whole subtree, so it is a leaf and
  // its children are never requested.
  let frontier: AtlasTileCoordinate[] = [{ z: 0, x: 0, y: 0 }];
  for (let z = 0; z <= targetDepth && frontier.length > 0; z += 1) {
    for (const coordinate of frontier) {
      requiredKeys.add(atlasTileKey(coordinate));
    }
    cache.pin(requiredKeys);

    // Catch each rejection into an outcome tagged with its coordinate, so a
    // failure never rejects the batch and does not stop the other branches.
    const loads = await Promise.all(
      frontier.map((coordinate) =>
        cache.load(coordinate, detail).then(
          (tileNodes): TileLoad => ({ coordinate, nodes: tileNodes }),
          (error: unknown): TileLoad => ({ coordinate, error }),
        ),
      ),
    );

    const next: AtlasTileCoordinate[] = [];
    for (const load of loads) {
      attempted += 1;
      if (!("nodes" in load)) {
        failures += 1;
        firstError ??= load.error;
        continue;
      }
      loadedTiles.push(load.coordinate);
      for (const node of load.nodes) {
        // Dedupe by id: samples are disjoint across the descent, so a collision
        // would be a backend inconsistency. `label`/`icon` are present only on a
        // detailed load, `typeIndices` only when colored types were requested;
        // keep the entry bare otherwise.
        nodes.set(node.id, {
          id: node.id,
          x: node.x,
          y: node.y,
          ...(node.label !== undefined ? { label: node.label } : {}),
          ...(node.icon !== undefined ? { icon: node.icon } : {}),
          ...(node.typeIndices !== undefined
            ? { typeIndices: node.typeIndices }
            : {}),
        });
      }
      // Descend only into an incomplete tile, and only below the target depth. A
      // missing flag (shouldn't happen after a success) is treated as a leaf.
      if (z < targetDepth && cache.completeOf(load.coordinate) === false) {
        for (const child of childCoordinates(load.coordinate)) {
          if (tileIntersectsRect(child, rect)) {
            next.push(child);
          }
        }
      }
    }
    frontier =
      next.length > MAX_DESCENT_FRONTIER
        ? next.slice(0, MAX_DESCENT_FRONTIER)
        : next;
  }

  if (attempted > 0 && failures === attempted) {
    throw new ViewportTilesError(
      `all ${failures} tile fetch(es) failed for the viewport`,
      firstError === undefined ? undefined : { cause: firstError },
    );
  }

  // Record movement in every mode, but speculate only when a later required
  // load can consume the geometry prefetch. Auxiliary loads always refetch
  // detail, so issuing minimal prefetches for them would spend every hit twice.
  cache.recordHistory(rect, targetDepth);
  if (detail === SaltileDetail.Minimal) {
    schedulePrefetch(cache, requiredKeys);
  }

  // Edges among the delivered tiles, ordered nearest-first so the transport's
  // tile cap keeps the most relevant tiles. Supplementary: a failure (or the
  // fetch being unsupported) leaves the nodes rendering without edges.
  let edges: ViewportEdge[] = [];
  if (loadedTiles.length > 0) {
    loadedTiles.sort(
      (a, b) =>
        tileDistance(a, rect, targetDepth) - tileDistance(b, rect, targetDepth),
    );
    try {
      // In the detailed view, fetch edges with their detail trailer too, so each
      // edge carries its link label and type reference for the hover label.
      edges = await cache.loadEdges(loadedTiles, detail);
    } catch {
      edges = [];
    }
  }

  return { nodes: [...nodes.values()], edges };
};

/** TanStack-Query-like snapshot of one async resource. */
export interface AtlasQueryState<T> {
  /** The latest resolved value, or `undefined` before the first success. */
  readonly data: T | undefined;
  /** The latest rejection, cleared when a fetch starts or succeeds. */
  readonly error: Error | undefined;
  /** A fetch is in flight and there is no data to show yet. */
  readonly isLoading: boolean;
  /** A fetch is in flight (including a background refetch over existing data). */
  readonly isFetching: boolean;
  /** The latest fetch rejected. */
  readonly isError: boolean;
  /** There is resolved data and no outstanding error. */
  readonly isSuccess: boolean;
  /** Re-runs the fetcher for the current key. */
  readonly refetch: () => void;
}

/** Options for {@link useAtlasQuery}. */
export interface UseAtlasQueryOptions {
  /**
   * Identity of the domain the resolved data is *true* in. It joins `key` (so a
   * change refetches) and additionally *discards* the visible data rather than
   * keeping it while the refetch runs: use it when previous data becomes wrong
   * rather than merely out of date — as re-pinning to another atlas generation
   * makes every decoded row id name a different entity. Leave unset (the default)
   * for stale-while-revalidate throughout.
   */
  readonly validity?: string | number;
}

const toError = (caught: unknown): Error =>
  caught instanceof Error ? caught : new Error(String(caught));

/**
 * A minimal, TanStack-Query-shaped async request state machine for the tiling
 * layer: it runs `fetcher` from `key`, tracking the request lifecycle as `data`
 * / `error` / `isLoading` / ... — a dependency-free stand-in for `useQuery` for
 * code that already owns its caching (the {@link TileCache}) and so wants the
 * request *state machine* without a second cache.
 *
 * `key` must fully identify the request: when it changes the hook aborts the old
 * fetch and starts a new one. `fetcher` may be a fresh closure each render (its
 * identity is not a trigger); only `key` and {@link AtlasQueryState.refetch}
 * start fetches. Previous `data` stays visible across a `key` change until the
 * next result resolves (stale-while-revalidate), so panning never blanks the
 * view — unless {@link UseAtlasQueryOptions.validity} changes, which discards it;
 * a superseded request (its `key` changed, or the hook unmounted) is aborted and
 * its result ignored.
 *
 * A result is published only while the request that produced it is still the one
 * this hook wants. Two things could otherwise put a retired result back on
 * screen. An `AbortSignal` is a request to the transport, not a promise
 * cancellation: a fetch already past its network read resolves normally. And the
 * effect's own `active` flag is lowered in a cleanup that runs after the commit,
 * while a changed `validity` drops the data during the render before it — so a
 * result landing in between would be adopted by the very state that had just
 * discarded its predecessor. Each continuation therefore re-checks the request
 * identity that render publishes, and a mismatch drops the result.
 */
export const useAtlasQuery = <T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseAtlasQueryOptions = {},
): AtlasQueryState<T> => {
  const { validity } = options;
  // `validity` rides inside the request key, so the discard below cannot happen
  // without the refetch that replaces what it dropped.
  const requestKey =
    validity === undefined ? key : `${key}|validity:${validity}`;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(true);
  const [renderedKey, setRenderedKey] = useState(requestKey);
  const [renderedValidity, setRenderedValidity] = useState(validity);
  const [reloadToken, setReloadToken] = useState(0);

  // The request whose results this hook will still adopt. It is assigned during
  // render, beside the state changes a new key causes, so it is already current
  // for any continuation that runs before the retired effect's cleanup. Writing
  // it is idempotent — a render React discards and repeats assigns the same
  // value — and it is a ref rather than state because no render reads it: it is
  // read only by continuations, which need the newest value rather than the one
  // their own render closed over.
  const liveRequestRef = useRef(requestKey);

  // A new key means a fetch is about to start in the effect below. Reflect that
  // during render — React's recommended alternative to a setState-in-effect —
  // keeping any previous data visible until the new result resolves.
  if (requestKey !== renderedKey) {
    setRenderedKey(requestKey);
    liveRequestRef.current = requestKey;
    setIsFetching(true);
    setError(undefined);
  }

  // Stale-while-revalidate is a courtesy to panning, and it is the wrong
  // courtesy when the resolved data stopped being *true* rather than merely
  // current: keeping it on screen would show wrong content, and let a click on it
  // act on wrong content. A changed `validity` drops it, blanking the view
  // deliberately until the fetch its key change started resolves.
  if (validity !== renderedValidity) {
    setRenderedValidity(validity);
    setData(undefined);
  }

  // Hold the latest fetcher without making it an effect dependency, so a new
  // closure identity each render does not, on its own, retrigger the fetch.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    const controller = new AbortController();
    // The request this fetch answers, compared against the live one when it
    // lands. `active` alone cannot decide it: the flag falls in a cleanup that
    // runs after the commit, and the data drop happens in the render before it.
    const issued = requestKey;
    let active = true;
    const publishable = () => active && liveRequestRef.current === issued;
    fetcherRef.current(controller.signal).then(
      (result) => {
        if (publishable()) {
          setData(result);
          setError(undefined);
          setIsFetching(false);
        }
      },
      (caught: unknown) => {
        // Ignore the rejection of a request we deliberately superseded.
        if (publishable() && !controller.signal.aborted) {
          setError(toError(caught));
          setIsFetching(false);
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey, reloadToken]);

  const refetch = useCallback(() => {
    setIsFetching(true);
    setError(undefined);
    setReloadToken((token) => token + 1);
  }, []);

  return {
    data,
    error,
    isLoading: isFetching && data === undefined,
    isFetching,
    isError: error !== undefined,
    isSuccess: data !== undefined && error === undefined,
    refetch,
  };
};

/** Options for {@link useGetViewportNodes}. */
export interface UseGetViewportNodesOptions {
  /** Atlas API origin forwarded to every tile fetch. */
  readonly baseUrl?: string;
  /** Retries per tile on a transient failure. */
  readonly retry?: number;
  /** Soft cache budget in bytes before eviction runs; see {@link TileCache}. */
  readonly maxBytes?: number;
  /**
   * Tile transport override; defaults to {@link fetchTile}, the SALTILE-wire
   * fetcher (which consumes `baseUrl`/`retry`). Passing one selects the
   * transport the cache loads through. Must be referentially stable across
   * renders: a new function identity recreates the cache and drops every
   * resident tile.
   */
  readonly fetcher?: TileFetcher;
  /**
   * Edges transport override; defaults to {@link fetchEdgesForTiles} (which
   * consumes `baseUrl`/`retry`). Must be referentially stable across renders,
   * for the same reason as {@link fetcher}.
   */
  readonly edgesFetcher?: EdgesFetcher;
  /**
   * The viewport's `detail` mode: `"auxiliary"` fetches the visible tiles with
   * the detail trailer so their nodes carry a `label` (the detailed view).
   * Unlike {@link fetcher}, this is *not* a cache-identity input — changing it
   * refetches the viewport while the cache keeps only geometry. Defaults to
   * `"minimal"`.
   */
  readonly detail?: SaltileDetail;
  /**
   * Versioned type URLs to colour by: each visible {@link ViewportNode} carries
   * the queried types it matches as {@link ViewportNode.typeIndices} (the tile
   * transport's `coloredTypeIds`). This *is* a cache-identity input —
   * changing the set refetches every tile with the new mask — so it must be
   * referentially stable across renders, like {@link fetcher}. Defaults to none.
   */
  readonly coloredTypeIds?: readonly string[];
  /**
   * The entity-query filter document binding the view, as the exact JSON bytes the manifest is POSTed
   * (or `undefined` for the unfiltered view). Unlike every other option it conditions no request the
   * cache makes: it binds the *session* those requests run under — the manifest seals it into the
   * authority token — so changing it replaces the session rather than the cache, which recreates the
   * cache, refetches, and discards on-screen rows through
   * {@link UseGetViewportNodesResult.sessionRevision} all the same, by the path a re-pin already
   * takes. Pass a stable serialization for a fixed filter (the server digests these bytes verbatim);
   * defaults to the unfiltered view.
   */
  readonly filter?: string;
}

/** {@link useGetViewportNodes}' result: the graph plus the backing cache's fill. */
export interface UseGetViewportNodesResult extends AtlasQueryState<ViewportGraph> {
  /**
   * The atlas session binding `data`'s node and edge ids belong to (the
   * transport's `getAtlasSessionRevision`). It travels with the graph because
   * *anything* a consumer derives from those ids — a selection, a hover, a cached
   * ego-graph — must be dropped if it changes: the ids do not expire, they come to
   * name rows this session does not answer for. It changes when the session is
   * replaced — a re-pin to another generation, an authority refused at its own
   * renewal, or a change of authenticated principal; see the module's "Sessions
   * and generations" note.
   */
  readonly sessionRevision: number;
  /**
   * The deepest quadtree depth the active generation tiles, from its manifest's
   * `bucketSchedule.maxZoom` (the transport's {@link getAtlasTileMaxZoom}).
   * `null` until the first session bootstraps. A consumer driving the tiling
   * camera clamps its requested tile depth to this rather than assuming the wire
   * ceiling — a given generation may tile shallower.
   */
  readonly tileMaxZoom: number | null;
  /** Tiles resident in the cache after the latest load. */
  readonly tileCount: number;
  /** Prefetch effectiveness accumulated over the session. */
  readonly prefetchStats: PrefetchStats;
}

/** Stable identity for a viewport, so a fetch reruns only on a real change. */
const viewportKey = (
  viewport: Viewport | null,
  baseUrl: string,
  detail: SaltileDetail,
  coloredTypeIds: readonly string[],
): string => {
  // The detail mode is part of the key: crossing the detail threshold must
  // refetch rather than serve the cached minimal result.
  const detailKey = detail === SaltileDetail.Auxiliary ? "|detail" : "";
  // The colored-type set is part of the key too: changing it recreates the
  // cache (see `useGetViewportNodes`), and the key must change alongside so the
  // now-empty cache refetches rather than serving the previous colouring.
  const colored =
    coloredTypeIds.length > 0 ? `|colored:${coloredTypeIds.join(",")}` : "";
  // The session binding is not spelled here: it rides the query's `validity`
  // (see `useGetViewportNodes`), which joins the key *and* discards the nodes on
  // screen — they name the retired session's rows, so they cannot be kept.
  return viewport === null
    ? `${baseUrl}|initial${detailKey}${colored}`
    : `${baseUrl}|${viewport.x1},${viewport.y1},${viewport.x2},${viewport.y2}|${viewport.zoom}${detailKey}${colored}`;
};

/**
 * Returns the nodes visible in `viewport` as a hook, with TanStack-Query-style
 * loading and error state (see {@link AtlasQueryState}). It owns a persistent
 * {@link TileCache} — created once per `(origin, budget, session binding)` and
 * kept across renders — so tiles, in-flight deduplication, distance eviction, and
 * prefetch prediction all persist as the viewport pans and zooms, and are
 * replaced wholesale whenever that session is replaced: a re-pin to another
 * generation, an authority refused at its own renewal, or a change of
 * authenticated principal (see the "Sessions and generations" note).
 *
 * `data` holds the merged nodes and their edges for the current viewport (the
 * previous viewport's graph stays visible until the new one resolves, so
 * navigating never blanks the graph). `error` is set only when
 * {@link getViewportNodes} rejects — a malformed viewport, or every required
 * tile failing; a partial failure (including a failed edge fetch) still resolves
 * with whatever loaded. Requires no provider.
 */
export const useGetViewportNodes = (
  viewport: Viewport | null,
  options: UseGetViewportNodesOptions = {},
): UseGetViewportNodesResult => {
  const {
    baseUrl = ATLAS_API_BASE_URL,
    retry,
    maxBytes,
    fetcher,
    edgesFetcher,
    detail = SaltileDetail.Minimal,
    coloredTypeIds = EMPTY_COLORED_TYPE_IDS,
    filter,
  } = options;

  // Bind the atlas session's view to `filter` before any fetch runs. A layout effect, not a passive
  // one: `useAtlasQuery`'s fetch is passive, so binding here lands ahead of the first bootstrap and
  // the view is filtered from its first tile rather than after a superseded unfiltered one. A real
  // change moves `sessionRevision` (see {@link setAtlasViewFilter}), and the machinery below — the
  // cache memo and the query's `validity`, both keyed on it — recreates the cache, refetches, and
  // discards the on-screen rows, exactly as a re-pin does.
  useLayoutEffect(() => {
    setAtlasViewFilter(baseUrl, filter);
  }, [baseUrl, filter]);

  // The session binding every resident tile was decoded under (see the module's
  // "Sessions and generations" note). Replacing that session makes those tiles
  // misattributed rather than stale — they name rows resolved for a view or an
  // actor this session does not answer for, and across a re-pin the ids themselves
  // decode to different, existing rows, with no remap either way — so it must
  // recreate the store rather than expire entries inside it, which is what naming
  // it in the memo below does.
  const sessionRevision = useSyncExternalStore(
    subscribeToAtlasSessionRevision,
    getAtlasSessionRevision,
    getAtlasSessionRevision,
  );

  // The deepest depth this generation's manifest tiles (its
  // `bucketSchedule.maxZoom`), so a consumer can clamp its requested tile depth
  // to what the server serves rather than the wire ceiling. `null` until the
  // first bootstrap resolves it.
  const tileMaxZoom = useSyncExternalStore(
    subscribeToAtlasTileMaxZoom,
    getAtlasTileMaxZoom,
    getAtlasTileMaxZoom,
  );

  const cache = useMemo(
    () =>
      new TileCache({
        maxBytes,
        fetcher:
          fetcher ??
          ((zoom, tileIndex, controls) =>
            fetchTile(zoom, tileIndex, {
              baseUrl,
              retry,
              priority: controls?.priority,
              signal: controls?.signal,
              detail: controls?.detail,
              coloredTypeIds,
            })),
        edgesFetcher:
          edgesFetcher ??
          ((tiles, controls) =>
            fetchEdgesForTiles(tiles, {
              baseUrl,
              retry,
              priority: controls?.priority,
              signal: controls?.signal,
              detail: controls?.detail,
            })),
      }),
    // `sessionRevision` is not read by the factory: it is the session identity the
    // cache's *contents* belong to, and naming it here is the whole fix — it
    // constructs a new, empty cache when that session is replaced. See its
    // declaration above for why replacement is the only correct response.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: see above
    [
      baseUrl,
      retry,
      maxBytes,
      fetcher,
      edgesFetcher,
      coloredTypeIds,
      sessionRevision,
    ],
  );

  const query = useAtlasQuery(
    viewportKey(viewport, baseUrl, detail, coloredTypeIds),
    async () => {
      const graph = await getViewportNodes(viewport, cache, {
        detail,
      });
      return { graph, tileCount: cache.tileCount };
    },
    // A replaced session does not just recreate the cache: it also refetches (the
    // revision joins the request key) and drops the nodes already on screen, which
    // name the retired session's rows.
    { validity: sessionRevision },
  );

  return {
    data: query.data?.graph,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    sessionRevision,
    tileMaxZoom,
    tileCount: query.data?.tileCount ?? 0,
    prefetchStats: cache.prefetchStats,
  };
};
