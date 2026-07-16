/**
 * Cancellable quadtree frontier for immutable Atlas tiles.
 *
 * The active set is always spatially disjoint. A cached parent remains active
 * until every visible direct child is ready, then those children replace it in
 * one publication. Each representative carries `visible / delivered` mass.
 */

import {
  AtlasClientError,
  atlasTileChildren,
  atlasTileKey,
  fetchAtlasTile,
  isAbortError,
  type AtlasSession,
  type AtlasTileCoordinate,
  type DecodedAtlasTile,
} from "./atlas-client";
import {
  AtlasTileCache,
  type AtlasTileCacheStats,
} from "./atlas-frontier/atlas-tile-cache";
import {
  atlasTileIntersectsBounds,
  selectAtlasViewTiles,
  type AtlasViewSelection,
  type AtlasViewState,
} from "./atlas-frontier/atlas-view";

export { atlasFitZoom } from "./atlas-frontier/atlas-view";
export type { AtlasViewState };

const defaultCacheByteBudget = 96 * 1024 * 1024;
const defaultConcurrency = 6;

/** One active tile and the mass assigned to each delivered representative. */
export interface WeightedAtlasTile {
  readonly massPerPoint: number;
  readonly tile: DecodedAtlasTile;
}

export type AtlasDebugTileState =
  | "active"
  | "cached"
  | "error"
  | "loading"
  | "queued";

/** Current request/frontier state for a visible quadtree cell. */
export interface AtlasDebugTile {
  readonly coordinate: AtlasTileCoordinate;
  readonly state: AtlasDebugTileState;
}

/** One failed tile request retained until an explicit retry or view change. */
export interface AtlasFrontierFailure {
  readonly coordinate: AtlasTileCoordinate;
  readonly error: AtlasClientError;
}

export type AtlasFrontierPhase = "error" | "loading" | "ready";

/** Immutable state published to React and the field renderer. */
export interface AtlasFrontierSnapshot {
  readonly activeTiles: readonly WeightedAtlasTile[];
  readonly cache: AtlasTileCacheStats;
  readonly debugTiles: readonly AtlasDebugTile[];
  readonly deliveredPointCount: number;
  readonly failures: readonly AtlasFrontierFailure[];
  readonly inflightCount: number;
  readonly phase: AtlasFrontierPhase;
  readonly queuedCount: number;
  readonly revision: number;
  readonly targetZoom: number;
  readonly visibleMass: number;
}

export type AtlasTileFetcher = (
  session: AtlasSession,
  coordinate: AtlasTileCoordinate,
  signal: AbortSignal,
) => Promise<DecodedAtlasTile>;

export interface AtlasFrontierOptions {
  /** Decoded-tile memory target. Protected viewport tiles may exceed it. */
  readonly cacheByteBudget?: number;
  /** Maximum concurrent tile requests. */
  readonly concurrency?: number;
  /** Injectable tile boundary used by deterministic tests. */
  readonly fetchTile?: AtlasTileFetcher;
}

interface InflightTile {
  readonly controller: AbortController;
  readonly coordinate: AtlasTileCoordinate;
}

type FrontierListener = () => void;

const emptySnapshot: AtlasFrontierSnapshot = {
  activeTiles: [],
  cache: { byteSize: 0, tileCount: 0 },
  debugTiles: [],
  deliveredPointCount: 0,
  failures: [],
  inflightCount: 0,
  phase: "loading",
  queuedCount: 0,
  revision: 0,
  targetZoom: 0,
  visibleMass: 0,
};

/** Owns tile requests, cache residency, and atomic frontier refinement. */
export class AtlasFrontier {
  readonly #cache: AtlasTileCache;
  readonly #concurrency: number;
  readonly #fetchTile: AtlasTileFetcher;
  readonly #listeners = new Set<FrontierListener>();
  readonly #session: AtlasSession;
  readonly #inflight = new Map<string, InflightTile>();
  readonly #failures = new Map<string, AtlasFrontierFailure>();
  #disposed = false;
  #queue: AtlasTileCoordinate[] = [];
  #selection?: AtlasViewSelection;
  #snapshot = emptySnapshot;

  constructor(session: AtlasSession, options: AtlasFrontierOptions = {}) {
    const concurrency = options.concurrency ?? defaultConcurrency;
    if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
      throw new RangeError("Atlas frontier concurrency must be positive");
    }
    this.#session = session;
    this.#concurrency = concurrency;
    this.#fetchTile = options.fetchTile ?? fetchAtlasTile;
    this.#cache = new AtlasTileCache(
      options.cacheByteBudget ?? defaultCacheByteBudget,
    );
  }

  /** Returns the latest immutable publication for `useSyncExternalStore`. */
  getSnapshot = (): AtlasFrontierSnapshot => this.#snapshot;

  /** Registers a publication listener. */
  subscribe = (listener: FrontierListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Reconciles requests and active cells with a new orthographic camera. */
  setView(view: AtlasViewState): void {
    this.#assertActive();
    this.#selection = selectAtlasViewTiles(view);

    for (const [key, inflight] of this.#inflight) {
      if (!this.#selection.requiredKeys.has(key)) {
        inflight.controller.abort();
        this.#inflight.delete(key);
      }
    }
    for (const key of this.#failures.keys()) {
      if (!this.#selection.requiredKeys.has(key)) {
        this.#failures.delete(key);
      }
    }

    this.#reconcile();
  }

  /** Retries failed cells that remain relevant to the current viewport. */
  retryFailed(): void {
    this.#assertActive();
    this.#failures.clear();
    this.#reconcile();
  }

  /** Aborts requests and releases decoded cache state. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const inflight of this.#inflight.values()) {
      inflight.controller.abort();
    }
    this.#inflight.clear();
    this.#queue = [];
    this.#cache.clear();
    this.#listeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Atlas frontier has been disposed");
    }
  }

  #reconcile(): void {
    const selection = this.#selection;
    if (selection === undefined || this.#disposed) {
      return;
    }

    const unresolved = selection.required.filter((coordinate) => {
      const key = atlasTileKey(coordinate);
      return !this.#cache.has(key);
    });
    const minimumUnresolvedZoom = unresolved.reduce(
      (minimum, coordinate) => Math.min(minimum, coordinate.z),
      Number.POSITIVE_INFINITY,
    );

    this.#queue = unresolved.filter((coordinate) => {
      const key = atlasTileKey(coordinate);
      return (
        coordinate.z === minimumUnresolvedZoom &&
        !this.#inflight.has(key) &&
        !this.#failures.has(key)
      );
    });

    this.#publish();
    this.#pump();
  }

  #pump(): void {
    while (
      !this.#disposed &&
      this.#inflight.size < this.#concurrency &&
      this.#queue.length > 0
    ) {
      const coordinate = this.#queue.shift();
      if (coordinate === undefined) {
        return;
      }
      const key = atlasTileKey(coordinate);
      const controller = new AbortController();
      const inflight = { controller, coordinate };
      this.#inflight.set(key, inflight);
      this.#publish();

      void this.#fetchTile(this.#session, coordinate, controller.signal)
        .then((tile) => {
          if (!this.#disposed) {
            const protectedKeys =
              this.#selection?.requiredKeys ?? new Set<string>();
            this.#cache.set(tile, protectedKeys);
            this.#failures.delete(key);
          }
        })
        .catch((error: unknown) => {
          if (this.#disposed || isAbortError(error)) {
            return;
          }
          const clientError =
            error instanceof AtlasClientError
              ? error
              : new AtlasClientError(
                  "network",
                  `Tile ${key} failed unexpectedly`,
                  { cause: error },
                );
          this.#failures.set(key, { coordinate, error: clientError });
        })
        .finally(() => {
          if (this.#inflight.get(key) === inflight) {
            this.#inflight.delete(key);
          }
          this.#reconcile();
        });
    }
  }

  #activeTiles(): WeightedAtlasTile[] {
    const selection = this.#selection;
    if (selection === undefined) {
      return [];
    }

    const resolve = (coordinate: AtlasTileCoordinate): WeightedAtlasTile[] => {
      if (!atlasTileIntersectsBounds(coordinate, selection.bounds)) {
        return [];
      }

      const tile = this.#cache.get(atlasTileKey(coordinate));
      if (tile === undefined) {
        return [];
      }
      if (coordinate.z >= selection.targetZoom) {
        return [this.#weightedTile(tile)];
      }

      const visibleChildren = atlasTileChildren(coordinate).filter((child) =>
        atlasTileIntersectsBounds(child, selection.bounds),
      );
      if (
        visibleChildren.length === 0 ||
        !visibleChildren.every((child) => this.#cache.has(atlasTileKey(child)))
      ) {
        return [this.#weightedTile(tile)];
      }
      return visibleChildren.flatMap((child) => resolve(child));
    };

    return resolve({ z: 0, x: 0, y: 0 });
  }

  #weightedTile(tile: DecodedAtlasTile): WeightedAtlasTile {
    return {
      massPerPoint:
        tile.deliveredCount === 0
          ? 0
          : tile.visibleSubtreeCount / tile.deliveredCount,
      tile,
    };
  }

  #publish(): void {
    const selection = this.#selection;
    if (selection === undefined) {
      return;
    }

    const activeTiles = this.#activeTiles();
    const activeKeys = new Set(
      activeTiles.map(({ tile }) => atlasTileKey(tile.coordinate)),
    );
    const queuedKeys = new Set(
      this.#queue.map((coordinate) => atlasTileKey(coordinate)),
    );
    const debugTiles = selection.required.map((coordinate): AtlasDebugTile => {
      const key = atlasTileKey(coordinate);
      let state: AtlasDebugTileState = "queued";
      if (activeKeys.has(key)) {
        state = "active";
      } else if (this.#failures.has(key)) {
        state = "error";
      } else if (this.#inflight.has(key)) {
        state = "loading";
      } else if (queuedKeys.has(key)) {
        state = "queued";
      } else if (this.#cache.has(key)) {
        state = "cached";
      }
      return { coordinate, state };
    });
    const failures = selection.required.flatMap((coordinate) => {
      const failure = this.#failures.get(atlasTileKey(coordinate));
      return failure === undefined ? [] : [failure];
    });
    const unresolvedCount = selection.required.reduce(
      (count, coordinate) =>
        count + Number(!this.#cache.has(atlasTileKey(coordinate))),
      0,
    );
    const deliveredPointCount = activeTiles.reduce(
      (total, weightedTile) => total + weightedTile.tile.deliveredCount,
      0,
    );
    const visibleMass = activeTiles.reduce(
      (total, weightedTile) => total + weightedTile.tile.visibleSubtreeCount,
      0,
    );

    this.#snapshot = {
      activeTiles,
      cache: this.#cache.stats,
      debugTiles,
      deliveredPointCount,
      failures,
      inflightCount: this.#inflight.size,
      phase:
        failures.length > 0
          ? "error"
          : unresolvedCount > 0
            ? "loading"
            : "ready",
      queuedCount: unresolvedCount - this.#inflight.size - failures.length,
      revision: this.#snapshot.revision + 1,
      targetZoom: selection.targetZoom,
      visibleMass,
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
