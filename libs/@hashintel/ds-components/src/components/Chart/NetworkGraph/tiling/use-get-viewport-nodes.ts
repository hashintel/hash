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
 * ## Ancestors
 *
 * A tile only carries the nodes assigned to it at its own depth; it does not
 * repeat nodes from shallower tiles. So the full node set for a region at depth
 * `z` is the union of that region's tiles at depths `0..z`. Every fetch here
 * therefore walks the whole depth stack, and the cache's eviction distance
 * keeps a viewport's ancestor stack resident (their world rectangles contain
 * the viewport, so their spatial distance is zero).
 *
 * ## Even density
 *
 * The tiles at one depth partition the viewport, so rendering only some of them
 * — the rest still loading, failed, or beyond the enumeration cap — shows as
 * uneven node density that traces the tile grid: covered tiles look dense, the
 * gaps between them sparse. {@link getViewportNodes} therefore contributes a
 * depth's nodes only when it holds *every* tile needed to completely cover the
 * viewport at that depth (an uncapped count; see {@link viewportTileCount}),
 * dropping partial depths so the merged result covers the viewport at uniform
 * density (at the cost of some detail until the whole depth is in).
 *
 * Once a depth qualifies, {@link getViewportNodes} renders *every* tile the cache
 * holds at that depth, not only the viewport-covering ones. Tiles resident just
 * past the viewport edge (pulled in by prefetch, or left over from an earlier
 * viewport) then contribute their nodes ahead of need, so panning across a tile
 * boundary reveals nodes that are already on screen instead of popping them in
 * once the boundary tile becomes required.
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
import { ATLAS_API_BASE_URL, fetchTile, type TileNode } from "./fetch-tile";
import {
  clampRectToWorld,
  requiredTiles,
  tileDistance,
  tileIndexOf,
  tileZoomForViewport,
  viewportTileCount,
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

/** Fetches the nodes of one tile, addressed as `fetchTile` does. */
export type TileFetcher = (
  zoom: number,
  tileIndex: number,
  controls?: TileFetchControls,
) => Promise<readonly TileNode[]>;

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
   * Every resident tile's nodes at depth `z`, in insertion order — including
   * tiles outside the current viewport (pulled in by prefetch, or left resident
   * from an earlier viewport). {@link getViewportNodes} renders these alongside
   * the viewport's own tiles so nodes just past a tile boundary are already on
   * screen when a pan reaches them, rather than popping in.
   */
  nodesAtDepth(z: number): (readonly TileNode[])[] {
    const tiles: (readonly TileNode[])[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.coordinate.z === z) {
        tiles.push(entry.nodes);
      }
    }
    return tiles;
  }

  /** Recent viewports, oldest first. */
  get history(): readonly ViewportRegion[] {
    return this.#history;
  }

  /**
   * Records the viewport a fetch is servicing so eviction distances are
   * measured against it and its required tiles are pinned (never evicted).
   */
  setActiveViewport(
    rect: Rect,
    depth: number,
    requiredKeys: ReadonlySet<string>,
  ): void {
    this.#viewport = { rect, depth };
    this.#pinned.clear();
    for (const key of requiredKeys) {
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
      .then((nodes) => {
        this.#inflight.delete(key);
        this.#prefetchControllers.delete(key);
        this.#store(key, coordinate, nodes, origin);
        return nodes;
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
    nodes: readonly TileNode[],
    origin: TileOrigin,
  ): void {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#bytes -= existing.bytes;
    }
    const bytes = estimateBytes(nodes);
    this.#entries.set(key, { coordinate, nodes, bytes, origin, used: false });
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
 * `cache` and returning the rest from it.
 *
 * A `null` viewport (a freshly mounted graph) returns the initial overview: the
 * four depth-1 quadrant tiles and their depth-0 root ancestor. Otherwise the
 * viewport's rectangle and zoom select a target depth, and the union of that
 * depth's tiles and all shallower ancestor tiles covering the rectangle is
 * fetched and merged (deduplicated by node id). A depth is included only when
 * every tile needed to completely cover the viewport at that depth is present;
 * a depth held only partially is dropped, so the result never mixes a full depth
 * with a partial one — see the module's "Even density" note. A qualifying depth
 * also contributes any other tiles the cache already holds at that depth, so
 * regions just past the viewport edge are drawn ahead of a pan reaching them.
 *
 * After serving the current viewport it records the movement and, while the
 * user is navigating, prefetches the tiles the next viewport is predicted to
 * need (see {@link schedulePrefetch}).
 *
 * @throws {@link ViewportTilesError} when the viewport is malformed, or when
 *   every required tile fetch fails (partial failures return what loaded).
 */
export const getViewportNodes = async (
  viewport: Viewport | null,
  cache: TileCache,
): Promise<ViewportNode[]> => {
  const { rect, depth } = resolveViewport(viewport);

  const coordinates = requiredTiles(rect, depth);
  const requiredKeys = new Set(coordinates.map(atlasTileKey));

  // Pin the required tiles before loading so a concurrent store/evict cannot
  // drop a tile this call is about to return.
  cache.setActiveViewport(rect, depth, requiredKeys);

  // Load every required tile, catching each rejection into an outcome tagged
  // with its coordinate — a bare rejection loses which depth failed, and the
  // depth-completeness check below needs it. `Promise.all` thus never rejects
  // here; total failure is detected from `failures` instead.
  const loads = await Promise.all(
    coordinates.map((coordinate) =>
      cache.load(coordinate).then(
        (tileNodes): TileLoad => ({ coordinate, nodes: tileNodes }),
        (error: unknown): TileLoad => ({ coordinate, error }),
      ),
    ),
  );

  // Count the successfully-loaded required tiles per depth, so each depth's
  // viewport coverage can be judged on its own below. The nodes themselves come
  // from the cache at render time (see below), not from these outcomes.
  const loadedCountByDepth = new Map<number, number>();
  let failures = 0;
  let firstError: unknown;
  for (const load of loads) {
    if ("nodes" in load) {
      loadedCountByDepth.set(
        load.coordinate.z,
        (loadedCountByDepth.get(load.coordinate.z) ?? 0) + 1,
      );
    } else {
      failures += 1;
      firstError ??= load.error;
    }
  }

  if (failures === coordinates.length && coordinates.length > 0) {
    throw new ViewportTilesError(
      `all ${failures} tile fetch(es) failed for the viewport`,
      firstError === undefined ? undefined : { cause: firstError },
    );
  }

  // A depth's tiles partition the viewport, so showing only some of them renders
  // as uneven density that traces the tile grid. Include a depth only when we
  // hold every tile needed to completely cover the viewport at that depth:
  // compare the count we loaded against the uncapped cover count. This drops a
  // depth with a failed tile, and one whose cover exceeds the enumeration cap
  // (so `requiredTiles` never fetched it whole) — in both cases we can't render
  // it without gaps.
  //
  // Once a depth qualifies, render every tile the cache holds at that depth, not
  // just the viewport-covering ones. Tiles resident just outside the viewport
  // (from prefetch, or an earlier viewport) then contribute their nodes too, so
  // panning across a tile boundary slides already-rendered nodes into view
  // instead of popping them in once the boundary tile becomes required.
  const nodes = new Map<number | string, ViewportNode>();
  for (const [z, loadedCount] of loadedCountByDepth) {
    if (loadedCount !== viewportTileCount(rect, z)) {
      continue;
    }
    for (const tileNodes of cache.nodesAtDepth(z)) {
      for (const node of tileNodes) {
        // Dedupe by id: tiles at one depth partition space (so off-viewport
        // tiles add distinct nodes) and deeper tiles never repeat ancestor
        // nodes, so a collision here would be a backend inconsistency.
        nodes.set(node.id, { id: node.id, x: node.x, y: node.y });
      }
    }
  }

  // Record movement, then prefetch for where the viewport is heading.
  cache.recordHistory(rect, depth);
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
  const { baseUrl = ATLAS_API_BASE_URL, retry, maxBytes } = options;

  const cache = useMemo(
    () =>
      new TileCache({
        maxBytes,
        fetcher: (zoom, tileIndex, controls) =>
          fetchTile(zoom, tileIndex, {
            baseUrl,
            retry,
            priority: controls?.priority,
            signal: controls?.signal,
          }),
      }),
    [baseUrl, retry, maxBytes],
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
