/**
 * Viewport-driven tiling for the Atlas network graph.
 *
 * {@link getViewportNodes} turns a camera viewport into the set of nodes that
 * should be on screen. It fetches the quadtree tiles the viewport covers (plus
 * their ancestors — see below), serving them from a {@link TileCache} and only
 * hitting the network for tiles it has never seen. The spatial geometry lives in
 * `./tile-geometry` and the speculative prefetch in `./tile-prefetch`.
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
 * ## Request state
 *
 * {@link useGetViewportNodes} wraps the fetch in {@link useAtlasQuery} — a
 * small, dependency-free async state machine (TanStack-Query-shaped: `data` /
 * `error` / `isLoading` / ...) for code that already owns its caching (the
 * {@link TileCache}) and wants only the request *state machine*, not a second
 * cache.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import {
  ATLAS_API_BASE_URL,
  fetchTile,
  type FetchedTile,
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

/** Default cache budget (~256 fully-delivered tiles). Tunable per instance. */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Rough heap cost of one cached node. Only used to compare tiles against the
 * byte budget, not for exact accounting: a small `{ id, x, y }` object plus its
 * slot is on this order in V8.
 */
const APPROX_BYTES_PER_NODE = 64;

/** Baseline cost of a cached tile independent of its node count. */
const APPROX_BYTES_PER_TILE = 256;

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
}

/** Fetches one tile — its nodes plus completeness — addressed as `fetchTile` does. */
export type TileFetcher = (
  zoom: number,
  tileIndex: number,
  controls?: TileFetchControls,
) => Promise<FetchedTile>;

/** Construction options for {@link TileCache}. */
export interface TileCacheOptions {
  /** Soft memory budget in bytes before eviction runs. */
  readonly maxBytes?: number;
  /** Tile fetcher; defaults to {@link fetchTile}. Injectable for tests. */
  readonly fetcher?: TileFetcher;
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
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<readonly TileNode[]>>();
  readonly #prefetchControllers = new Map<string, AbortController>();
  readonly #history: ViewportRegion[] = [];
  readonly #pinned = new Set<string>();

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
  }

  /** Number of tiles currently resident. */
  get tileCount(): number {
    return this.#entries.size;
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
   */
  async load(coordinate: AtlasTileCoordinate): Promise<readonly TileNode[]> {
    const key = atlasTileKey(coordinate);
    const cached = this.#entries.get(key);
    if (cached) {
      // A required load landing on a prefetched tile is the prefetch paying off.
      if (cached.origin === "prefetch" && !cached.used) {
        cached.used = true;
        this.#prefetchUsed += 1;
      }
      return cached.nodes;
    }
    const inFlight = this.#inflight.get(key);
    if (inFlight) {
      // A required load riding an in-flight prefetch claims it: a later batch
      // must not abort a fetch this viewport now depends on, and the prefetch
      // counts as a hit once it lands (marked when it settles, since the tile
      // stores only after this shared promise has already returned).
      this.#prefetchControllers.delete(key);
      void inFlight.then(
        () => this.#markUsed(key),
        () => {},
      );
      return inFlight;
    }
    // A required tile that was neither resident nor prefetched in time.
    this.#requiredColdMiss += 1;
    return this.#fetch(key, coordinate, "required");
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

  /** Starts one low-priority, cancellable prefetch; a no-op if already held. */
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
    void this.#fetch(key, coordinate, "prefetch", controller.signal).catch(
      () => undefined,
    );
  }

  #fetch(
    key: string,
    coordinate: AtlasTileCoordinate,
    origin: TileOrigin,
    signal?: AbortSignal,
  ): Promise<readonly TileNode[]> {
    const pending = this.#fetcher(coordinate.z, tileIndexOf(coordinate), {
      priority: origin === "prefetch" ? "low" : "high",
      signal,
    })
      .then((fetched) => {
        this.#inflight.delete(key);
        this.#prefetchControllers.delete(key);
        this.#store(key, coordinate, fetched, origin);
        return fetched.nodes;
      })
      .catch((error: unknown) => {
        this.#inflight.delete(key);
        this.#prefetchControllers.delete(key);
        throw error;
      });
    this.#inflight.set(key, pending);
    return pending;
  }

  /** Resolves once all in-flight fetches (including prefetches) settle. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.#inflight.values()]);
  }

  #store(
    key: string,
    coordinate: AtlasTileCoordinate,
    fetched: FetchedTile,
    origin: TileOrigin,
  ): void {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#bytes -= existing.bytes;
    }
    const bytes = estimateBytes(fetched.nodes);
    this.#entries.set(key, {
      coordinate,
      nodes: fetched.nodes,
      complete: fetched.complete,
      bytes,
      origin,
      used: false,
    });
    this.#bytes += bytes;
    this.#evict();
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
    const candidates = [...this.#entries.values()].filter(
      (entry) => !this.#pinned.has(atlasTileKey(entry.coordinate)),
    );
    // Furthest first. With no active viewport yet, fall back to insertion order
    // (Map iteration order), which `[...values()]` preserves, so the oldest
    // tiles leave first.
    if (viewport) {
      candidates.sort(
        (a, b) =>
          tileDistance(b.coordinate, viewport.rect, viewport.depth) -
          tileDistance(a.coordinate, viewport.rect, viewport.depth),
      );
    }
    for (const entry of candidates) {
      if (this.#bytes <= this.maxBytes) {
        break;
      }
      if (entry.origin === "prefetch" && !entry.used) {
        this.#prefetchWasted += 1;
      }
      this.#entries.delete(atlasTileKey(entry.coordinate));
      this.#bytes -= entry.bytes;
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

/**
 * Returns the nodes visible in `viewport`, fetching any missing tiles through
 * `cache` by a completeness-pruned descent (see the module's "Descent" note) and
 * returning the merged, id-deduplicated result.
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
 * After serving the current viewport it records the movement and, while the
 * user is navigating, prefetches the tiles the next viewport is predicted to
 * need (see {@link schedulePrefetch}).
 *
 * @throws {@link ViewportTilesError} when the viewport is malformed, or when
 *   every tile fetch attempted for the viewport fails (a partial failure returns
 *   what loaded).
 */
export const getViewportNodes = async (
  viewport: Viewport | null,
  cache: TileCache,
): Promise<ViewportNode[]> => {
  const { rect, depth: targetDepth } = resolveViewport(viewport);

  // Reset the eviction anchor and pins to this viewport; the descent pins each
  // tile it touches below, so a concurrent store/evict can't drop one mid-call.
  cache.setActiveViewport(rect, targetDepth);

  const nodes = new Map<number | string, ViewportNode>();
  const requiredKeys = new Set<string>();
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
        cache.load(coordinate).then(
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
      for (const node of load.nodes) {
        // Dedupe by id: samples are disjoint across the descent, so a collision
        // would be a backend inconsistency.
        nodes.set(node.id, { id: node.id, x: node.x, y: node.y });
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

  // Record movement, then prefetch for where the viewport is heading.
  cache.recordHistory(rect, targetDepth);
  schedulePrefetch(cache, requiredKeys);

  return [...nodes.values()];
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
 * view; a superseded request (its `key` changed, or the hook unmounted) is
 * aborted and its result ignored.
 */
export const useAtlasQuery = <T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
): AtlasQueryState<T> => {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(true);
  const [renderedKey, setRenderedKey] = useState(key);
  const [reloadToken, setReloadToken] = useState(0);

  // A new key means a fetch is about to start in the effect below. Reflect that
  // during render — React's recommended alternative to a setState-in-effect —
  // keeping any previous data visible until the new result resolves.
  if (key !== renderedKey) {
    setRenderedKey(key);
    setIsFetching(true);
    setError(undefined);
  }

  // Hold the latest fetcher without making it an effect dependency, so a new
  // closure identity each render does not, on its own, retrigger the fetch.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetcherRef.current(controller.signal).then(
      (result) => {
        if (active) {
          setData(result);
          setError(undefined);
          setIsFetching(false);
        }
      },
      (caught: unknown) => {
        // Ignore the rejection of a request we deliberately superseded.
        if (active && !controller.signal.aborted) {
          setError(toError(caught));
          setIsFetching(false);
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, reloadToken]);

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
   * Tile transport override; defaults to the legacy-wire {@link fetchTile}
   * (which consumes `baseUrl`/`retry`). Passing one selects the wire the
   * cache loads through - the SALTILE fetcher plugs in here. Must be
   * referentially stable across renders: a new function identity
   * recreates the cache and drops every resident tile.
   */
  readonly fetcher?: TileFetcher;
}

/** {@link useGetViewportNodes}' result: nodes plus the backing cache's fill. */
export interface UseGetViewportNodesResult extends AtlasQueryState<
  ViewportNode[]
> {
  /** Tiles resident in the cache after the latest load. */
  readonly tileCount: number;
  /** Prefetch effectiveness accumulated over the session. */
  readonly prefetchStats: PrefetchStats;
}

/** Stable identity for a viewport, so a fetch reruns only on a real change. */
const viewportKey = (viewport: Viewport | null, baseUrl: string): string =>
  viewport === null
    ? `${baseUrl}|initial`
    : `${baseUrl}|${viewport.x1},${viewport.y1},${viewport.x2},${viewport.y2}|${viewport.zoom}`;

/**
 * Returns the nodes visible in `viewport` as a hook, with TanStack-Query-style
 * loading and error state (see {@link AtlasQueryState}). It owns a persistent
 * {@link TileCache} — created once per `(origin, budget)` and kept across
 * renders — so tiles, in-flight deduplication, distance eviction, and prefetch
 * prediction all persist as the viewport pans and zooms.
 *
 * `data` holds the merged nodes for the current viewport (the previous
 * viewport's nodes stay visible until the new ones resolve, so navigating never
 * blanks the graph). `error` is set only when {@link getViewportNodes} rejects —
 * a malformed viewport, or every required tile failing; a partial failure still
 * resolves with whatever loaded. Requires no provider.
 */
export const useGetViewportNodes = (
  viewport: Viewport | null,
  options: UseGetViewportNodesOptions = {},
): UseGetViewportNodesResult => {
  const { baseUrl = ATLAS_API_BASE_URL, retry, maxBytes, fetcher } = options;

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
            })),
      }),
    [baseUrl, retry, maxBytes, fetcher],
  );

  const query = useAtlasQuery(viewportKey(viewport, baseUrl), async () => {
    const nodes = await getViewportNodes(viewport, cache);
    return { nodes, tileCount: cache.tileCount };
  });

  return {
    data: query.data?.nodes,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    tileCount: query.data?.tileCount ?? 0,
    prefetchStats: cache.prefetchStats,
  };
};
