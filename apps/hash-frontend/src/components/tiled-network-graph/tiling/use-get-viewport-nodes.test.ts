import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getViewportNodes,
  TileCache,
  tileZoomForViewport,
  ViewportTilesError,
  type EdgesFetcher,
  type TileFetcher,
  type Viewport,
} from "./use-get-viewport-nodes";

import type { AtlasTileCoordinate } from "./atlas-tile-coordinate";
import type { TileEdge } from "./fetch-edges-for-tiles";
import type { FetchedTile, TileNode } from "./fetch-tile";
import type { EntityId } from "@blockprotocol/type-system";

/**
 * A fetcher returning three unique nodes per tile, tracking calls per tile.
 * `complete` decides which tiles report their subtree as fully delivered — the
 * descent stops at a complete tile — and defaults to always-incomplete, so the
 * descent walks to the viewport's target depth (the pre-LOD behaviour).
 */
const countingFetcher = (
  complete: (zoom: number, tileIndex: number) => boolean = () => false,
): TileFetcher & {
  readonly calls: Map<string, number>;
  total: () => number;
} => {
  const calls = new Map<string, number>();
  const fetcher = (zoom: number, tileIndex: number): Promise<FetchedTile> => {
    const key = `${zoom}/${tileIndex}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    const base = zoom * 1_000_000 + tileIndex * 10;
    return Promise.resolve({
      nodes: [
        { id: base, x: 1, y: 1 },
        { id: base + 1, x: 2, y: 2 },
        { id: base + 2, x: 3, y: 3 },
      ],
      complete: complete(zoom, tileIndex),
    });
  };
  return Object.assign(fetcher, {
    calls,
    total: () => [...calls.values()].reduce((sum, count) => sum + count, 0),
  });
};

/** A stub edges fetcher for node-focused tests: never any edges. */
const noEdges: EdgesFetcher = () =>
  Promise.resolve({ edges: [], complete: true });

/** An edges fetcher returning a fixed edge list, recording each call's tiles. */
const stubEdges = (
  edges: TileEdge[],
): EdgesFetcher & { readonly calls: AtlasTileCoordinate[][] } => {
  const calls: AtlasTileCoordinate[][] = [];
  const fetcher: EdgesFetcher = (tiles) => {
    calls.push([...tiles]);
    return Promise.resolve({ edges, complete: true });
  };
  return Object.assign(fetcher, { calls });
};

/**
 * A single-tile fetcher (root reports complete, so the descent stops there)
 * that attaches a `label` to each node only when detailed data is requested,
 * recording the detail flag of every call. Lets tests observe the flag being
 * threaded through and labels reaching the returned nodes.
 */
const labellingFetcher = (): TileFetcher & {
  readonly calls: { readonly key: string; readonly detailed: boolean }[];
} => {
  const calls: { key: string; detailed: boolean }[] = [];
  const fetcher: TileFetcher = (zoom, tileIndex, controls) => {
    const detailed = controls?.includeDetailedData ?? false;
    calls.push({ key: `${zoom}/${tileIndex}`, detailed });
    const base = zoom * 1_000_000 + tileIndex * 10;
    const node = (id: number): TileNode =>
      detailed ? { id, x: 1, y: 1, label: `n${id}` } : { id, x: 1, y: 1 };
    return Promise.resolve({
      nodes: [node(base), node(base + 1), node(base + 2)],
      complete: true,
    });
  };
  return Object.assign(fetcher, { calls });
};

const viewportAt = (
  centreX: number,
  centreY: number,
  half: number,
  zoom: number,
): Viewport => ({
  x1: centreX - half,
  x2: centreX + half,
  y1: centreY - half,
  y2: centreY + half,
  zoom,
});

// Matches `estimateBytes`: baseline per tile plus three nodes.
const bytesPerTile = 256 + 3 * 64;
// Matches `estimateEdgeBytes`: baseline per bucket plus one edge.
const bytesPerSingleEdgeBucket = 128 + 64;

describe("tileZoomForViewport", () => {
  it("snaps fractional zoom to the nearest integer tile depth", () => {
    expect(tileZoomForViewport(1.4)).toBe(1);
    expect(tileZoomForViewport(1.6)).toBe(2);
    expect(tileZoomForViewport(1.5)).toBe(2);
  });

  it("clamps to the addressable depth range", () => {
    expect(tileZoomForViewport(-3)).toBe(0);
    expect(tileZoomForViewport(99)).toBe(16);
  });
});

describe("getViewportNodes", () => {
  let fetcher: ReturnType<typeof countingFetcher>;

  beforeEach(() => {
    fetcher = countingFetcher();
  });

  it("returns the depth-0 root plus four depth-1 tiles for a null viewport", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    const { nodes } = await getViewportNodes(null, cache);

    expect(fetcher.total()).toBe(5);
    expect(fetcher.calls.has("0/0")).toBe(true);
    expect(nodes).toHaveLength(15);
  });

  it("serves a repeated viewport entirely from cache", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    await getViewportNodes(null, cache);
    const afterFirst = fetcher.total();

    await getViewportNodes(null, cache);
    expect(fetcher.total()).toBe(afterFirst);
  });

  it("descends every ancestor depth for a deep viewport while tiles stay incomplete", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_000, 3), cache);

    const depths = new Set(
      [...fetcher.calls.keys()].map((key) => Number(key.split("/")[0])),
    );
    expect([...depths].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("deduplicates nodes shared across tiles", async () => {
    // A fetcher that returns the same id from every tile collapses to one node.
    const constant: TileFetcher = () =>
      Promise.resolve({ nodes: [{ id: 42, x: 5, y: 5 }], complete: false });
    const { nodes } = await getViewportNodes(
      null,
      new TileCache({ fetcher: constant, edgesFetcher: noEdges }),
    );
    expect(nodes).toEqual([{ id: 42, x: 5, y: 5 }]);
  });

  it("stops the descent at a tile that reports its subtree complete", async () => {
    // The root delivers its whole subtree (complete), so its children are never
    // requested even though the null viewport's target depth is 1.
    const rootComplete = countingFetcher((zoom) => zoom === 0);
    const cache = new TileCache({
      fetcher: rootComplete,
      edgesFetcher: noEdges,
    });
    const { nodes } = await getViewportNodes(null, cache);

    expect(rootComplete.total()).toBe(1);
    expect(rootComplete.calls.has("0/0")).toBe(true);
    expect(nodes).toHaveLength(3);
  });

  it("descends into an incomplete branch all the way to the deepest tile depth", async () => {
    // A tight viewport at the maximum zoom whose tiles never report complete: the
    // descent must reach depth 16 (the finest quadtree level) to surface the
    // nodes the server bucketed into the deepest tiles.
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    await getViewportNodes(viewportAt(30_000, 30_000, 2, 16), cache);

    const reachedDeepest = [...fetcher.calls.keys()].some((key) =>
      key.startsWith("16/"),
    );
    expect(reachedDeepest).toBe(true);
    // Data-bounded, not viewport-area-bounded: a tiny rect touches only a handful
    // of tiles per depth, so the whole descent stays small.
    expect(fetcher.total()).toBeLessThan(100);
  });

  it("throws when the viewport is malformed", async () => {
    await expect(
      getViewportNodes(
        { x1: Number.NaN, x2: 1, y1: 0, y2: 1, zoom: 2 },
        new TileCache({ fetcher, edgesFetcher: noEdges }),
      ),
    ).rejects.toBeInstanceOf(ViewportTilesError);
  });

  it("throws only when every tile fetch fails", async () => {
    const failing: TileFetcher = () => Promise.reject(new Error("boom"));
    await expect(
      getViewportNodes(
        null,
        new TileCache({ fetcher: failing, edgesFetcher: noEdges }),
      ),
    ).rejects.toBeInstanceOf(ViewportTilesError);
  });

  it("returns the tiles that loaded when only some fail", async () => {
    // The root loads (incomplete, so the descent reaches depth 1); one of its
    // four depth-1 children fails. The rest still render — a failed branch drops
    // out without taking its siblings down.
    const base = countingFetcher();
    const partial: TileFetcher = (zoom, tileIndex, controls) =>
      zoom === 1 && tileIndex === 0
        ? Promise.reject(new Error("gap"))
        : base(zoom, tileIndex, controls);
    const { nodes } = await getViewportNodes(
      null,
      new TileCache({ fetcher: partial, edgesFetcher: noEdges }),
    );
    // Root (3 nodes) plus three of the four depth-1 tiles (3 each).
    expect(nodes).toHaveLength(12);
    expect(nodes.some((node) => node.id === 0)).toBe(true); // the root
  });

  it("renders only the descent's covering tiles, not unrelated cached ones", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    // Prime a depth-1 neighbour the viewport below never covers: the top-right
    // quadrant { z: 1, x: 1, y: 0 } (row-major index 1).
    await cache.load({ z: 1, x: 1, y: 0 });

    // A viewport wholly inside the top-left quadrant. Its descent covers the root
    // and only { z: 1, x: 0, y: 0 }.
    const { nodes } = await getViewportNodes(
      viewportAt(8_000, 8_000, 4_000, 1),
      cache,
    );

    const ids = new Set(nodes.map((node) => node.id));
    // The primed neighbour (base = 1 * 1_000_000 + 1 * 10) is outside the
    // viewport, so the descent never visits it and it is not rendered.
    expect(ids.has(1_000_010)).toBe(false);
    // Root (3) plus the single covering depth-1 tile (3).
    expect(nodes).toHaveLength(6);
  });

  it("prefetches ahead of a detected pan", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_024, 5), cache);
    await getViewportNodes(viewportAt(12_048, 10_000, 1_024, 5), cache);
    await cache.settled();

    // The pan crosses into depth-5 column x=7, beyond the second viewport's own
    // columns (5..6), so prediction should have pulled it into the cache.
    const prefetched =
      cache.has({ z: 5, x: 7, y: 4 }) || cache.has({ z: 5, x: 7, y: 5 });
    expect(prefetched).toBe(true);
  });

  it("does not prefetch when the viewport is unchanged", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    await getViewportNodes(viewportAt(30_000, 30_000, 1_024, 5), cache);
    const stable = cache.tileCount;

    await getViewportNodes(viewportAt(30_000, 30_000, 1_024, 5), cache);
    await cache.settled();
    expect(cache.tileCount).toBe(stable);
  });

  it("keeps prefetch paying off across a mode-switching path (ring covers a turn)", async () => {
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });
    // Pan right, then turn and pan down: a purely-directional predictor would
    // miss the turn, but the omnidirectional ring has the new tiles ready.
    const path = [
      viewportAt(20_000, 20_000, 1_024, 5),
      viewportAt(22_048, 20_000, 1_024, 5),
      viewportAt(24_096, 20_000, 1_024, 5),
      viewportAt(24_096, 22_048, 1_024, 5),
      viewportAt(24_096, 24_096, 1_024, 5),
    ];
    for (const viewport of path) {
      await getViewportNodes(viewport, cache);
      await cache.settled();
    }

    const stats = cache.prefetchStats;
    expect(stats.issued).toBeGreaterThan(0);
    expect(stats.used).toBeGreaterThan(0);
  });

  it("issues no prefetches when the cache is full", async () => {
    const cache = new TileCache({
      fetcher,
      maxBytes: 1,
      edgesFetcher: noEdges,
    });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_024, 5), cache);
    await getViewportNodes(viewportAt(12_048, 10_000, 1_024, 5), cache);
    await cache.settled();

    // A 1-byte budget keeps the cache permanently full, so the fullness taper
    // drives the prefetch budget to zero.
    expect(cache.prefetchStats.issued).toBe(0);
  });

  it("loads required tiles at high priority and prefetches at low", async () => {
    const priorities: (string | undefined)[] = [];
    const priorityFetcher: TileFetcher = (zoom, tileIndex, controls) => {
      priorities.push(controls?.priority);
      return Promise.resolve({
        nodes: [{ id: zoom * 1_000 + tileIndex, x: 0, y: 0 }],
        complete: false,
      });
    };
    const cache = new TileCache({
      fetcher: priorityFetcher,
      edgesFetcher: noEdges,
    });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_024, 5), cache);
    await getViewportNodes(viewportAt(12_048, 10_000, 1_024, 5), cache);
    await cache.settled();

    expect(priorities).toContain("high"); // required loads
    expect(priorities).toContain("low"); // prefetches
  });

  it("cancels superseded prefetches when the viewport jumps away", async () => {
    // Prefetches (low priority) stay in flight until aborted; required loads
    // (high) resolve at once — so a later jump can supersede the pending ring.
    const pendingFetcher: TileFetcher = (zoom, tileIndex, controls) => {
      if (controls?.priority === "low") {
        return new Promise<FetchedTile>((_resolve, reject) => {
          controls.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });
      }
      return Promise.resolve({
        nodes: [{ id: zoom * 1_000 + tileIndex, x: 0, y: 0 }],
        complete: false,
      });
    };
    const cache = new TileCache({
      fetcher: pendingFetcher,
      edgesFetcher: noEdges,
    });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_024, 5), cache);
    await getViewportNodes(viewportAt(12_048, 10_000, 1_024, 5), cache); // ring fires
    await getViewportNodes(viewportAt(55_000, 55_000, 1_024, 5), cache); // jump away

    expect(cache.prefetchStats.cancelled).toBeGreaterThan(0);
  });
});

describe("getViewportNodes edges", () => {
  it("fetches all delivered tiles' edges in one request and buckets them", async () => {
    const fetcher = countingFetcher();
    // Null viewport delivers the root (ids 0..2) and four depth-1 tiles
    // ({ z:1 } base = 1_000_000 + tileIndex * 10).
    const edgesFetcher = stubEdges([
      { id: "id-500" as EntityId, source: 0, target: 1 }, // within the root tile
      { id: "id-501" as EntityId, source: 1_000_000, target: 1_000_001 }, // within tile z1/0
      { id: "id-502" as EntityId, source: 1_000_000, target: 1_000_010 }, // z1/0 <-> z1/1
    ]);
    const cache = new TileCache({ fetcher, edgesFetcher });

    const { edges } = await getViewportNodes(null, cache);

    // One request carried every delivered tile (root + four depth-1 tiles).
    expect(edgesFetcher.calls).toHaveLength(1);
    expect(edgesFetcher.calls[0]).toHaveLength(5);
    expect(edges.map((edge) => edge.id).sort()).toEqual([
      "id-500",
      "id-501",
      "id-502",
    ]);
    // Two single-tile buckets plus one tile-pair bucket.
    expect(cache.edgeBucketCount).toBe(3);
  });

  it("serves a repeated viewport's edges from cache without refetching", async () => {
    const fetcher = countingFetcher();
    const edgesFetcher = stubEdges([
      { id: "id-700" as EntityId, source: 1_000_000, target: 1_000_010 },
    ]);
    const cache = new TileCache({ fetcher, edgesFetcher });

    const first = await getViewportNodes(null, cache);
    const second = await getViewportNodes(null, cache);

    expect(edgesFetcher.calls).toHaveLength(1);
    expect(second.edges).toEqual(first.edges);
  });

  it("returns the nodes with no edges when the edge fetch fails", async () => {
    const fetcher = countingFetcher();
    const failingEdges: EdgesFetcher = () =>
      Promise.reject(new Error("edges down"));
    const cache = new TileCache({ fetcher, edgesFetcher: failingEdges });

    const { nodes, edges } = await getViewportNodes(null, cache);

    expect(nodes.length).toBeGreaterThan(0);
    expect(edges).toEqual([]);
  });
});

describe("getViewportNodes detailed data", () => {
  it("omits node labels without detailed data", async () => {
    const fetcher = labellingFetcher();
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });

    const { nodes } = await getViewportNodes(null, cache);

    expect(nodes.every((node) => node.label === undefined)).toBe(true);
    expect(fetcher.calls.every((call) => !call.detailed)).toBe(true);
  });

  it("carries node labels when detailed data is requested", async () => {
    const fetcher = labellingFetcher();
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });

    const { nodes } = await getViewportNodes(null, cache, {
      includeDetailedData: true,
    });

    expect(nodes.map((node) => node.label)).toEqual(["n0", "n1", "n2"]);
    expect(fetcher.calls.every((call) => call.detailed)).toBe(true);
  });

  it("refetches a resident compact tile with detail on entering the detailed view", async () => {
    const fetcher = labellingFetcher();
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });

    const compact = await getViewportNodes(null, cache);
    expect(compact.nodes.every((node) => node.label === undefined)).toBe(true);
    const compactCalls = fetcher.calls.length;

    const detailed = await getViewportNodes(null, cache, {
      includeDetailedData: true,
    });
    expect(detailed.nodes.every((node) => node.label !== undefined)).toBe(true);
    // The compact-only resident tile could not serve the detailed load, so it
    // was refetched detailed (upgraded in place).
    expect(fetcher.calls.length).toBe(compactCalls + 1);
    expect(fetcher.calls.at(-1)?.detailed).toBe(true);
  });

  it("serves a compact load from a resident detailed tile without downgrading it", async () => {
    const fetcher = labellingFetcher();
    const cache = new TileCache({ fetcher, edgesFetcher: noEdges });

    await getViewportNodes(null, cache, { includeDetailedData: true });
    const detailedCalls = fetcher.calls.length;

    const { nodes } = await getViewportNodes(null, cache);

    // A detailed tile is a superset of the compact one, so the compact load hits
    // the resident entry — no refetch — and its labels survive.
    expect(fetcher.calls.length).toBe(detailedCalls);
    expect(nodes.every((node) => node.label !== undefined)).toBe(true);
  });
});

describe("TileCache", () => {
  it("rejects a non-positive byte budget", () => {
    expect(() => new TileCache({ maxBytes: 0 })).toThrow(ViewportTilesError);
  });

  it("shares one in-flight fetch between concurrent loads", async () => {
    const fetcher = vi.fn(
      (zoom: number, tileIndex: number): Promise<FetchedTile> =>
        Promise.resolve({
          nodes: [{ id: zoom * 100 + tileIndex, x: 0, y: 0 }],
          complete: false,
        }),
    );
    const cache = new TileCache({ fetcher });

    const [a, b] = await Promise.all([
      cache.load({ z: 3, x: 1, y: 2 }),
      cache.load({ z: 3, x: 1, y: 2 }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("evicts the furthest tiles to stay within budget while pinning the viewport", async () => {
    const fetcher = countingFetcher();
    const cache = new TileCache({ fetcher, maxBytes: bytesPerTile * 3 });
    cache.setActiveViewport(
      viewportAt(0, 0, 500, 5),
      5,
      false,
      new Set(["5/0/0"]), // atlasTileKey of { z: 5, x: 0, y: 0 }
    );

    // Every one of these is far from the origin viewport and unpinned. Stores
    // (and eviction) run synchronously per resolved fetch, so the final state
    // is deterministic regardless of load order.
    await Promise.all(
      Array.from({ length: 20 }, (_unused, x) =>
        cache.load({ z: 5, x, y: 20 }),
      ),
    );
    await cache.load({ z: 5, x: 0, y: 0 }); // the pinned tile (index 0)

    expect(cache.byteEstimate).toBeLessThanOrEqual(cache.maxBytes);
    expect(cache.tileCount).toBeLessThanOrEqual(3);
    expect(cache.has({ z: 5, x: 0, y: 0 })).toBe(true);
  });

  it("does not let a load issued before a generation re-pin enter the replaced cache", async () => {
    // A tile fetch left in flight under the generation the cache was built for.
    let settle!: (tile: FetchedTile) => void;
    const inFlight = new Promise<FetchedTile>((resolve) => {
      settle = resolve;
    });
    const cache = new TileCache({ fetcher: () => inFlight });
    const pending = cache.load({ z: 2, x: 1, y: 1 });

    // The re-pin (the transport's `404` refresh landing on another generation).
    // `useGetViewportNodes` names the session revision in the memo that builds this
    // cache, so React constructs a fresh one rather than resetting this one: a row
    // id from the retired generation decodes to a *different, existing* row under
    // the new one, so nothing may carry over — least of all a fetch that was
    // already in flight when the session re-pinned.
    const replaced = new TileCache({
      fetcher: () =>
        Promise.resolve({
          nodes: [{ id: 555, x: 0, y: 0 }],
          complete: true,
        }),
    });
    settle({ nodes: [{ id: 111, x: 0, y: 0 }], complete: true });
    await pending;

    const nodes = await replaced.load({ z: 2, x: 1, y: 1 });

    // The deferred result stayed in the store it was issued from, which the view
    // no longer reads; the live store holds only the new generation's row.
    expect(nodes.map(({ id }) => id)).toEqual([555]);
    expect(cache.has({ z: 2, x: 1, y: 1 })).toBe(true);
    expect(replaced.tileCount).toBe(1);
  });

  it("evicts a tile-pair edge bucket when an endpoint tile is evicted", async () => {
    const fetcher = countingFetcher();
    const tileA = { z: 5, x: 0, y: 0 }; // nodes 5_000_000..02
    const tileB = { z: 5, x: 1, y: 0 }; // tileIndex 1 → nodes 5_000_010..12
    const edgesFetcher = stubEdges([
      { id: "id-900" as EntityId, source: 5_000_000, target: 5_000_010 }, // crosses A <-> B
    ]);
    // Budget for exactly the two node tiles plus the one pair bucket.
    const cache = new TileCache({
      fetcher,
      edgesFetcher,
      maxBytes: bytesPerTile * 2 + bytesPerSingleEdgeBucket,
    });

    cache.setActiveViewport(viewportAt(1_024, 1_024, 500, 5), 5, false);
    await cache.load(tileA);
    await cache.load(tileB);
    await cache.loadEdges([tileA, tileB]);
    expect(cache.edgeBucketCount).toBe(1);

    // Move far away (clearing pins), then load a tile near the new viewport: the
    // furthest resident tile (A or B) is evicted, cascading to the pair bucket.
    cache.setActiveViewport(viewportAt(60_000, 60_000, 500, 5), 5, false);
    await cache.load({ z: 5, x: 29, y: 29 });

    expect(cache.edgeBucketCount).toBe(0);
    expect(cache.has(tileA) && cache.has(tileB)).toBe(false);
  });
});
