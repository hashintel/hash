/**
 * Viewport-driven tiling for the Atlas network graph.
 *
 * {@link getViewportNodes} turns a camera viewport into the set of nodes that
 * should be on screen. It fetches the quadtree tiles the viewport covers (plus
 * their ancestors — see below), serving them from a {@link TileCache} and only
 * hitting the network for tiles it has never seen.
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
 * detailed level) and clamp to `[0, {@link ATLAS_TILE_MAX_ZOOM}]`. The viewport
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
 */

import {
  ATLAS_TILE_AXIS_SIZE,
  ATLAS_TILE_MAX_ZOOM,
  atlasTileBounds,
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import { fetchTileNodes, type TileNode } from "./fetch-tile-nodes";

/** Width and height of the world axis the grid tiles over (`65536`). */
export const WORLD_SIZE = ATLAS_TILE_AXIS_SIZE;

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

/**
 * Cap on tiles fetched per depth along each axis. Bounds the work when a caller
 * passes a viewport rectangle and zoom that disagree (e.g. the whole world at a
 * deep zoom), which would otherwise enumerate an entire grid level.
 */
const MAX_TILES_ACROSS = 8;

/** How many recent viewports to retain for movement prediction. */
const HISTORY_LENGTH = 5;

/** Upper bound on tiles speculatively prefetched per call. */
const PREFETCH_LIMIT = 6;

/**
 * Above this cache fullness, prefetching stops entirely; below it, the budget
 * tapers with fullness so a busy cache prefetches less aggressively.
 */
const PREFETCH_FULLNESS_CEILING = 0.85;

/**
 * Minimum pan, as a fraction of the viewport's smaller side, before a movement
 * is treated as intentional (rather than jitter) and triggers prefetching.
 */
const MIN_PAN_FRACTION = 0.15;

/**
 * Relative weight of a one-level zoom gap against a full-world spatial gap in
 * the eviction distance. Below 1 so spatial distance dominates: the depth stack
 * over the current location outlives tiles from a location left behind.
 */
const ZOOM_DISTANCE_WEIGHT = 0.5;

/** A world-space rectangle, `[x1, x2] x [y1, y2]`. */
export interface Rect {
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
}

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

/** Fetches the nodes of one tile, addressed as `fetchTileNodes` does. */
export type TileFetcher = (
  zoom: number,
  tileIndex: number,
) => Promise<readonly TileNode[]>;

/** Construction options for {@link TileCache}. */
export interface TileCacheOptions {
  /** Soft memory budget in bytes before eviction runs. */
  readonly maxBytes?: number;
  /** Tile fetcher; defaults to {@link fetchTileNodes}. Injectable for tests. */
  readonly fetcher?: TileFetcher;
}

/** Every tile fetch for a viewport failed. */
export class ViewportTilesError extends Error {
  override readonly name = "ViewportTilesError";
}

const clampInt = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const rectWidth = (rect: Rect): number => rect.x2 - rect.x1;
const rectHeight = (rect: Rect): number => rect.y2 - rect.y1;
const rectCenterX = (rect: Rect): number => (rect.x1 + rect.x2) / 2;
const rectCenterY = (rect: Rect): number => (rect.y1 + rect.y2) / 2;

/** Snaps a fractional zoom to an integer, deliverable tile depth. */
export const tileZoomForViewport = (zoom: number): number =>
  clampInt(Math.round(zoom), 0, ATLAS_TILE_MAX_ZOOM);

/** Clamps a rectangle to the world bounds, keeping `min <= max`. */
const clampRectToWorld = (rect: Rect): Rect => ({
  x1: clampInt(Math.min(rect.x1, rect.x2), 0, WORLD_SIZE),
  x2: clampInt(Math.max(rect.x1, rect.x2), 0, WORLD_SIZE),
  y1: clampInt(Math.min(rect.y1, rect.y2), 0, WORLD_SIZE),
  y2: clampInt(Math.max(rect.y1, rect.y2), 0, WORLD_SIZE),
});

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

/** Clamps a tile-index span to at most `MAX_TILES_ACROSS`, centred on itself. */
const clampSpan = (
  minimum: number,
  maximum: number,
  gridMaximum: number,
): readonly [number, number] => {
  if (maximum - minimum + 1 <= MAX_TILES_ACROSS) {
    return [minimum, maximum];
  }
  const centre = Math.floor((minimum + maximum) / 2);
  const start = clampInt(
    centre - Math.floor(MAX_TILES_ACROSS / 2),
    0,
    gridMaximum,
  );
  return [start, clampInt(start + MAX_TILES_ACROSS - 1, 0, gridMaximum)];
};

/** Tile-index range covering `rect` at depth `z`. */
const tileRangeForDepth = (
  rect: Rect,
  z: number,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const gridSize = 2 ** z;
  const span = WORLD_SIZE / gridSize;
  const gridMaximum = gridSize - 1;
  const [minX, maxX] = clampSpan(
    clampInt(Math.floor(rect.x1 / span), 0, gridMaximum),
    clampInt(Math.floor(rect.x2 / span), 0, gridMaximum),
    gridMaximum,
  );
  const [minY, maxY] = clampSpan(
    clampInt(Math.floor(rect.y1 / span), 0, gridMaximum),
    clampInt(Math.floor(rect.y2 / span), 0, gridMaximum),
    gridMaximum,
  );
  return { minX, maxX, minY, maxY };
};

/**
 * All tiles whose nodes are needed to fill `rect` at `targetDepth`: the tiles
 * at that depth intersecting the rectangle, plus every ancestor depth `0..z`
 * (which the depth loop yields for free, since shallower tiles cover the same
 * region).
 */
const requiredTiles = (
  rect: Rect,
  targetDepth: number,
): AtlasTileCoordinate[] => {
  const coordinates: AtlasTileCoordinate[] = [];
  for (let z = 0; z <= targetDepth; z += 1) {
    const { minX, maxX, minY, maxY } = tileRangeForDepth(rect, z);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        coordinates.push({ z, x, y });
      }
    }
  }
  return coordinates;
};

/** `tileIndex` (row-major) of a coordinate, as `fetchTileNodes` expects. */
const tileIndexOf = (coordinate: AtlasTileCoordinate): number =>
  coordinate.y * 2 ** coordinate.z + coordinate.x;

/** Gap between two closed intervals; `0` when they overlap or touch. */
const intervalGap = (
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): number => {
  if (aMax < bMin) {
    return bMin - aMax;
  }
  if (bMax < aMin) {
    return aMin - bMax;
  }
  return 0;
};

/**
 * Distance from a cached tile to the current viewport, in three dimensions:
 * planar gap between the tile's world rectangle and the viewport (normalised to
 * the world size), plus a weighted zoom-level gap. The rectangle gap — rather
 * than a centre-to-centre distance — is what keeps an ancestor tile "near": its
 * rectangle contains the viewport, so the planar term is zero and only the
 * (down-weighted) zoom term remains.
 */
const tileDistance = (
  coordinate: AtlasTileCoordinate,
  rect: Rect,
  targetDepth: number,
): number => {
  const bounds = atlasTileBounds(coordinate);
  const gapX = intervalGap(rect.x1, rect.x2, bounds.minimumX, bounds.maximumX);
  const gapY = intervalGap(rect.y1, rect.y2, bounds.minimumY, bounds.maximumY);
  const planar = Math.hypot(gapX, gapY) / WORLD_SIZE;
  const zoomGap = Math.abs(coordinate.z - targetDepth) / ATLAS_TILE_MAX_ZOOM;
  return Math.hypot(planar, ZOOM_DISTANCE_WEIGHT * zoomGap);
};

interface CacheEntry {
  readonly coordinate: AtlasTileCoordinate;
  readonly nodes: readonly TileNode[];
  readonly bytes: number;
}

interface ViewportRecord {
  readonly rect: Rect;
  readonly depth: number;
}

interface ResolvedViewport {
  readonly rect: Rect;
  readonly depth: number;
}

const estimateBytes = (nodes: readonly TileNode[]): number =>
  APPROX_BYTES_PER_TILE + nodes.length * APPROX_BYTES_PER_NODE;

/**
 * A distance-evicting, in-flight-deduplicating store of decoded tiles plus the
 * recent-viewport history that drives prefetching.
 *
 * Callers construct one and pass it to {@link getViewportNodes} across renders
 * so tiles (and movement history) persist. When it exceeds its byte budget it
 * evicts the tiles furthest from the current viewport in the 3-D
 * {@link tileDistance} metric, never evicting a tile the current viewport
 * requires.
 */
export class TileCache {
  readonly maxBytes: number;

  readonly #fetcher: TileFetcher;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<readonly TileNode[]>>();
  readonly #history: ViewportRecord[] = [];
  readonly #pinned = new Set<string>();

  #bytes = 0;
  #viewport: ViewportRecord | null = null;

  constructor(options: TileCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!(this.maxBytes > 0)) {
      throw new ViewportTilesError(
        `TileCache maxBytes must be positive, got ${String(this.maxBytes)}`,
      );
    }
    this.#fetcher = options.fetcher ?? fetchTileNodes;
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

  has(coordinate: AtlasTileCoordinate): boolean {
    return this.#entries.has(atlasTileKey(coordinate));
  }

  /** Recent viewports, oldest first. */
  get history(): readonly ViewportRecord[] {
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
      return cached.nodes;
    }
    const inFlight = this.#inflight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const pending = this.#fetcher(coordinate.z, tileIndexOf(coordinate))
      .then((nodes) => {
        this.#inflight.delete(key);
        this.#store(key, coordinate, nodes);
        return nodes;
      })
      .catch((error: unknown) => {
        this.#inflight.delete(key);
        throw error;
      });
    this.#inflight.set(key, pending);
    return pending;
  }

  /** How many tiles to prefetch given current fullness (0 when near full). */
  prefetchBudget(): number {
    const { fullness } = this;
    if (fullness >= PREFETCH_FULLNESS_CEILING) {
      return 0;
    }
    return Math.max(0, Math.ceil(PREFETCH_LIMIT * (1 - fullness)));
  }

  /** Resolves once all in-flight fetches (including prefetches) settle. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.#inflight.values()]);
  }

  #store(
    key: string,
    coordinate: AtlasTileCoordinate,
    nodes: readonly TileNode[],
  ): void {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#bytes -= existing.bytes;
    }
    const bytes = estimateBytes(nodes);
    this.#entries.set(key, { coordinate, nodes, bytes });
    this.#bytes += bytes;
    this.#evict();
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
      this.#entries.delete(atlasTileKey(entry.coordinate));
      this.#bytes -= entry.bytes;
    }
  }
}

/** Resolves a viewport (or the initial `null`) to a clamped rect and depth. */
const resolveViewport = (viewport: Viewport | null): ResolvedViewport => {
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
 * Predicts the next viewport by extrapolating the last movement, so tiles can
 * be prefetched ahead of a drag or scroll. Returns `null` when there is too
 * little history or the movement is below the jitter threshold.
 *
 * A mouse drag pans (the rectangle translates) and a scroll zooms (the depth
 * shifts); both show up as a consistent delta between the last two viewports,
 * which we project one step forward. Prediction is intentionally conservative —
 * a single lookahead step, gated on real movement — so it never runs far ahead
 * of the user.
 */
const predictNextViewport = (
  history: readonly ViewportRecord[],
): ResolvedViewport | null => {
  if (history.length < 2) {
    return null;
  }
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  if (!current || !previous) {
    return null;
  }

  const deltaX = rectCenterX(current.rect) - rectCenterX(previous.rect);
  const deltaY = rectCenterY(current.rect) - rectCenterY(previous.rect);
  const deltaDepth = current.depth - previous.depth;

  const smallerSide = Math.min(
    rectWidth(current.rect),
    rectHeight(current.rect),
  );
  const panThreshold = smallerSide * MIN_PAN_FRACTION;
  const panned = Math.hypot(deltaX, deltaY) >= panThreshold && panThreshold > 0;
  const zoomed = deltaDepth !== 0;
  if (!panned && !zoomed) {
    return null;
  }

  const centreX = rectCenterX(current.rect) + deltaX;
  const centreY = rectCenterY(current.rect) + deltaY;
  const halfWidth = rectWidth(current.rect) / 2;
  const halfHeight = rectHeight(current.rect) / 2;
  const predictedDepth = clampInt(
    current.depth + Math.sign(deltaDepth),
    0,
    ATLAS_TILE_MAX_ZOOM,
  );

  return {
    rect: clampRectToWorld({
      x1: centreX - halfWidth,
      x2: centreX + halfWidth,
      y1: centreY - halfHeight,
      y2: centreY + halfHeight,
    }),
    depth: predictedDepth,
  };
};

/** Kicks off speculative prefetches for a predicted viewport (never awaited). */
const prefetchAhead = (
  cache: TileCache,
  prediction: ResolvedViewport,
  currentKeys: ReadonlySet<string>,
): void => {
  const budget = cache.prefetchBudget();
  if (budget <= 0) {
    return;
  }
  const candidates = requiredTiles(prediction.rect, prediction.depth)
    .filter(
      (coordinate) =>
        !currentKeys.has(atlasTileKey(coordinate)) && !cache.has(coordinate),
    )
    .map((coordinate) => ({
      coordinate,
      distance: tileDistance(coordinate, prediction.rect, prediction.depth),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, budget);

  for (const { coordinate } of candidates) {
    // Speculative: swallow failures so a bad prediction never surfaces.
    void cache.load(coordinate).catch(() => undefined);
  }
};

/**
 * Returns the nodes visible in `viewport`, fetching any missing tiles through
 * `cache` and returning the rest from it.
 *
 * A `null` viewport (a freshly mounted graph) returns the initial overview: the
 * four depth-1 quadrant tiles and their depth-0 root ancestor. Otherwise the
 * viewport's rectangle and zoom select a target depth, and the union of that
 * depth's tiles and all shallower ancestor tiles covering the rectangle is
 * fetched and merged (deduplicated by node id).
 *
 * After serving the current viewport it records the movement and, when a drag
 * or scroll is detected, prefetches a conservative, fullness-scaled set of the
 * tiles the next viewport is predicted to need.
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

  const results = await Promise.allSettled(
    coordinates.map((coordinate) => cache.load(coordinate)),
  );

  const nodes = new Map<number | string, ViewportNode>();
  let failures = 0;
  let firstError: unknown;
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const node of result.value) {
        // Dedupe by id. Tiles at a single depth partition space and deeper
        // tiles never repeat ancestor nodes, so this is defensive.
        nodes.set(node.id, { id: node.id, x: node.x, y: node.y });
      }
    } else {
      failures += 1;
      firstError ??= result.reason;
    }
  }

  if (failures === coordinates.length && coordinates.length > 0) {
    throw new ViewportTilesError(
      `all ${failures} tile fetch(es) failed for the viewport`,
      firstError === undefined ? undefined : { cause: firstError },
    );
  }

  // Record movement, then prefetch for where the viewport is heading.
  cache.recordHistory(rect, depth);
  const prediction = predictNextViewport(cache.history);
  if (prediction) {
    prefetchAhead(cache, prediction, requiredKeys);
  }

  return [...nodes.values()];
};
