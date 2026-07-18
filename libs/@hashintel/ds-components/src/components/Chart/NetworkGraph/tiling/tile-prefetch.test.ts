import { describe, expect, it } from "vitest";

import {
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import {
  rectCenterX,
  rectWidth,
  requiredTiles,
  type ViewportRegion,
} from "./tile-geometry";
import {
  predictNextViewport,
  prefetchBudget,
  schedulePrefetch,
  type PrefetchCache,
} from "./tile-prefetch";

/** A square viewport region centred at `(cx, cy)`, half-side `half`, at `depth`. */
const region = (
  cx: number,
  cy: number,
  half: number,
  depth: number,
): ViewportRegion => ({
  rect: { x1: cx - half, x2: cx + half, y1: cy - half, y2: cy + half },
  depth,
});

const keysOf = (region_: ViewportRegion): Set<string> =>
  new Set(requiredTiles(region_.rect, region_.depth).map(atlasTileKey));

const fakeCache = (
  history: ViewportRegion[],
  options: { fullness?: number; cached?: ReadonlySet<string> } = {},
): PrefetchCache & { readonly prefetched: AtlasTileCoordinate[] } => {
  const prefetched: AtlasTileCoordinate[] = [];
  const cached = options.cached ?? new Set<string>();
  return {
    fullness: options.fullness ?? 0,
    history,
    has: (coordinate) => cached.has(atlasTileKey(coordinate)),
    prefetch: (coordinate) => {
      prefetched.push(coordinate);
    },
    prefetched,
  };
};

describe("predictNextViewport", () => {
  it("projects a steady pan one step ahead at the same size and depth", () => {
    const prediction = predictNextViewport([
      region(10_000, 10_000, 1_024, 5),
      region(12_000, 10_000, 1_024, 5),
      region(14_000, 10_000, 1_024, 5),
    ]);

    expect(prediction).not.toBeNull();
    expect(rectCenterX(prediction!.rect)).toBeCloseTo(16_000, 0);
    expect(rectWidth(prediction!.rect)).toBeCloseTo(2_048, 0);
    expect(prediction!.depth).toBe(5);
  });

  it("shrinks the rectangle and deepens the depth when zooming in", () => {
    const current = region(10_000, 10_000, 512, 6);
    const prediction = predictNextViewport([
      region(10_000, 10_000, 2_048, 4),
      region(10_000, 10_000, 1_024, 5),
      current,
    ]);

    expect(prediction).not.toBeNull();
    expect(rectWidth(prediction!.rect)).toBeLessThan(rectWidth(current.rect));
    expect(prediction!.depth).toBe(7);
  });

  it("grows the rectangle and shallows the depth when zooming out", () => {
    const current = region(10_000, 10_000, 2_048, 4);
    const prediction = predictNextViewport([
      region(10_000, 10_000, 512, 6),
      region(10_000, 10_000, 1_024, 5),
      current,
    ]);

    expect(prediction).not.toBeNull();
    expect(rectWidth(prediction!.rect)).toBeGreaterThan(
      rectWidth(current.rect),
    );
    expect(prediction!.depth).toBe(3);
  });

  it("returns null on a discontinuous jump (framing / jump-to)", () => {
    expect(
      predictNextViewport([
        region(10_000, 10_000, 1_024, 5),
        region(50_000, 10_000, 1_024, 5),
      ]),
    ).toBeNull();
  });

  it("returns null when idle or below the jitter threshold", () => {
    expect(
      predictNextViewport([
        region(10_000, 10_000, 1_024, 5),
        region(10_000, 10_000, 1_024, 5),
      ]),
    ).toBeNull();
    expect(predictNextViewport([region(10_000, 10_000, 1_024, 5)])).toBeNull();
  });

  it("smooths a single noisy step rather than chasing it", () => {
    // Two steady +2000 steps then a noisy 0-step: the averaged velocity still
    // points forward, not stalled.
    const prediction = predictNextViewport([
      region(10_000, 10_000, 1_024, 5),
      region(12_000, 10_000, 1_024, 5),
      region(14_000, 10_000, 1_024, 5),
      region(14_000, 10_000, 1_024, 5),
    ]);

    expect(prediction).not.toBeNull();
    expect(rectCenterX(prediction!.rect)).toBeGreaterThan(14_000);
  });
});

describe("prefetchBudget", () => {
  it("is positive when empty and tapers to zero as the cache fills", () => {
    expect(prefetchBudget(0)).toBeGreaterThan(0);
    expect(prefetchBudget(0.5)).toBeGreaterThan(0);
    expect(prefetchBudget(0.5)).toBeLessThan(prefetchBudget(0));
    expect(prefetchBudget(0.75)).toBeLessThan(prefetchBudget(0.5));
  });

  it("stops entirely above the fullness ceiling", () => {
    expect(prefetchBudget(0.85)).toBe(0);
    expect(prefetchBudget(0.95)).toBe(0);
  });
});

describe("schedulePrefetch", () => {
  it("prefetches a ring, covering directions orthogonal to the pan", () => {
    const current = region(22_048, 20_000, 1_024, 5);
    const cache = fakeCache([region(20_000, 20_000, 1_024, 5), current]);

    schedulePrefetch(cache, keysOf(current));

    expect(cache.prefetched.length).toBeGreaterThan(0);
    // The pan is along +x; the ring still reaches the rows above/below (y 8, 11)
    // that a purely-directional predictor would never touch.
    const orthogonal = cache.prefetched.some(
      ({ z, y }) => z === 5 && (y === 8 || y === 11),
    );
    expect(orthogonal).toBe(true);
  });

  it("still prefetches the ring on a jump (no directional prediction)", () => {
    const current = region(50_000, 10_000, 1_024, 5);
    const cache = fakeCache([region(10_000, 10_000, 1_024, 5), current]);

    // The last step is a jump, so predictNextViewport is null — but the ring
    // around the landing viewport still fires.
    expect(predictNextViewport(cache.history)).toBeNull();
    schedulePrefetch(cache, keysOf(current));
    expect(cache.prefetched.length).toBeGreaterThan(0);
  });

  it("prefetches nothing while dwelling", () => {
    const spot = region(30_000, 30_000, 1_024, 5);
    const cache = fakeCache([spot, spot]);

    schedulePrefetch(cache, keysOf(spot));
    expect(cache.prefetched).toHaveLength(0);
  });

  it("prefetches nothing when the cache is full", () => {
    const current = region(22_048, 20_000, 1_024, 5);
    const cache = fakeCache([region(20_000, 20_000, 1_024, 5), current], {
      fullness: 0.95,
    });

    schedulePrefetch(cache, keysOf(current));
    expect(cache.prefetched).toHaveLength(0);
  });
});
