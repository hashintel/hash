import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getViewportNodes,
  TileCache,
  tileZoomForViewport,
  ViewportTilesError,
  type TileFetcher,
  type Viewport,
} from "./use-get-viewport-nodes";

import type { TileNode } from "./fetch-tile";

/** A fetcher returning three unique nodes per tile, tracking calls per tile. */
const countingFetcher = (): TileFetcher & {
  readonly calls: Map<string, number>;
  total: () => number;
} => {
  const calls = new Map<string, number>();
  const fetcher = (zoom: number, tileIndex: number): Promise<TileNode[]> => {
    const key = `${zoom}/${tileIndex}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    const base = zoom * 1_000_000 + tileIndex * 10;
    return Promise.resolve([
      { id: base, x: 1, y: 1 },
      { id: base + 1, x: 2, y: 2 },
      { id: base + 2, x: 3, y: 3 },
    ]);
  };
  return Object.assign(fetcher, {
    calls,
    total: () => [...calls.values()].reduce((sum, count) => sum + count, 0),
  });
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
    const cache = new TileCache({ fetcher });
    const nodes = await getViewportNodes(null, cache);

    expect(fetcher.total()).toBe(5);
    expect(fetcher.calls.has("0/0")).toBe(true);
    expect(nodes).toHaveLength(15);
  });

  it("serves a repeated viewport entirely from cache", async () => {
    const cache = new TileCache({ fetcher });
    await getViewportNodes(null, cache);
    const afterFirst = fetcher.total();

    await getViewportNodes(null, cache);
    expect(fetcher.total()).toBe(afterFirst);
  });

  it("fetches every ancestor depth for a deep viewport", async () => {
    const cache = new TileCache({ fetcher });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_000, 3), cache);

    const depths = new Set(
      [...fetcher.calls.keys()].map((key) => Number(key.split("/")[0])),
    );
    expect([...depths].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("deduplicates nodes shared across tiles", async () => {
    // A fetcher that returns the same id from every tile collapses to one node.
    const constant: TileFetcher = () =>
      Promise.resolve([{ id: 42, x: 5, y: 5 }]);
    const nodes = await getViewportNodes(
      null,
      new TileCache({ fetcher: constant }),
    );
    expect(nodes).toEqual([{ id: 42, x: 5, y: 5 }]);
  });

  it("throws when the viewport is malformed", async () => {
    await expect(
      getViewportNodes(
        { x1: Number.NaN, x2: 1, y1: 0, y2: 1, zoom: 2 },
        new TileCache({ fetcher }),
      ),
    ).rejects.toBeInstanceOf(ViewportTilesError);
  });

  it("throws only when every tile fetch fails", async () => {
    const failing: TileFetcher = () => Promise.reject(new Error("boom"));
    await expect(
      getViewportNodes(null, new TileCache({ fetcher: failing })),
    ).rejects.toBeInstanceOf(ViewportTilesError);
  });

  it("returns the tiles that loaded when only some fail", async () => {
    const partial: TileFetcher = (zoom, tileIndex) =>
      zoom === 0
        ? Promise.reject(new Error("no root"))
        : fetcher(zoom, tileIndex);
    const nodes = await getViewportNodes(
      null,
      new TileCache({ fetcher: partial }),
    );
    // Root (3 nodes) dropped; the four depth-1 tiles remain.
    expect(nodes).toHaveLength(12);
  });

  it("prefetches ahead of a detected pan", async () => {
    const cache = new TileCache({ fetcher });
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
    const cache = new TileCache({ fetcher });
    await getViewportNodes(viewportAt(30_000, 30_000, 1_024, 5), cache);
    const stable = cache.tileCount;

    await getViewportNodes(viewportAt(30_000, 30_000, 1_024, 5), cache);
    await cache.settled();
    expect(cache.tileCount).toBe(stable);
  });

  it("keeps prefetch paying off across a mode-switching path (ring covers a turn)", async () => {
    const cache = new TileCache({ fetcher });
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
    const cache = new TileCache({ fetcher, maxBytes: 1 });
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
      return Promise.resolve([{ id: zoom * 1_000 + tileIndex, x: 0, y: 0 }]);
    };
    const cache = new TileCache({ fetcher: priorityFetcher });
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
        return new Promise<TileNode[]>((_resolve, reject) => {
          controls.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });
      }
      return Promise.resolve([{ id: zoom * 1_000 + tileIndex, x: 0, y: 0 }]);
    };
    const cache = new TileCache({ fetcher: pendingFetcher });
    await getViewportNodes(viewportAt(10_000, 10_000, 1_024, 5), cache);
    await getViewportNodes(viewportAt(12_048, 10_000, 1_024, 5), cache); // ring fires
    await getViewportNodes(viewportAt(55_000, 55_000, 1_024, 5), cache); // jump away

    expect(cache.prefetchStats.cancelled).toBeGreaterThan(0);
  });
});

describe("TileCache", () => {
  it("rejects a non-positive byte budget", () => {
    expect(() => new TileCache({ maxBytes: 0 })).toThrow(ViewportTilesError);
  });

  it("shares one in-flight fetch between concurrent loads", async () => {
    const fetcher = vi.fn(
      (zoom: number, tileIndex: number): Promise<TileNode[]> =>
        Promise.resolve([{ id: zoom * 100 + tileIndex, x: 0, y: 0 }]),
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
});
