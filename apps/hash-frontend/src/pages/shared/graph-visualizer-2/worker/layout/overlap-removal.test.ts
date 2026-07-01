// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";
import { Rectangle, removeOverlaps as colaRemoveOverlaps } from "webcola";

import { mulberry32 } from "../../math/random";
import { VpscOverlapRemover } from "./overlap-removal";

interface RectSet {
  x: Float32Array;
  y: Float32Array;
  halfW: Float32Array;
  halfH: Float32Array;
  count: number;
}

/**
 * Random axis-aligned rectangles packed into a square whose side scales with the
 * average size, so overlaps are common but the set is not a single pile-up.
 */
function randomRects(
  count: number,
  seed: number,
  sizeJitter = true,
  spanPerNode = 12,
): RectSet {
  const rng = mulberry32(seed);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const halfW = new Float32Array(count);
  const halfH = new Float32Array(count);
  const span = Math.sqrt(count) * spanPerNode;
  for (let index = 0; index < count; index++) {
    x[index] = rng() * span;
    y[index] = rng() * span;
    halfW[index] = sizeJitter ? 3 + rng() * 9 : 6;
    halfH[index] = sizeJitter ? 3 + rng() * 9 : 6;
  }
  return { x, y, halfW, halfH, count };
}

/**
 * Direct O(n²) overlap check. Two rectangles overlap when their x-intervals and
 * y-intervals both interpenetrate by more than `eps` — the small tolerance
 * absorbs the Float32 rounding of the (Float64) solver output.
 */
function overlappingPairs(set: RectSet, eps = 1e-2): number {
  const { x, y, halfW, halfH, count } = set;
  let pairs = 0;
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const penX = halfW[a]! + halfW[b]! - Math.abs(x[a]! - x[b]!);
      const penY = halfH[a]! + halfH[b]! - Math.abs(y[a]! - y[b]!);
      if (penX > eps && penY > eps) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

function totalDisplacement(
  set: RectSet,
  origX: Float32Array,
  origY: Float32Array,
): number {
  let sum = 0;
  for (let index = 0; index < set.count; index++) {
    const dx = set.x[index]! - origX[index]!;
    const dy = set.y[index]! - origY[index]!;
    sum += Math.hypot(dx, dy);
  }
  return sum;
}

function clone(set: RectSet): RectSet {
  return {
    x: Float32Array.from(set.x),
    y: Float32Array.from(set.y),
    halfW: Float32Array.from(set.halfW),
    halfH: Float32Array.from(set.halfH),
    count: set.count,
  };
}

describe("VpscOverlapRemover", () => {
  it("removes all overlaps in random rectangle sets", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const set = randomRects(400, seed);
      expect(overlappingPairs(set)).toBeGreaterThan(0);

      const remover = new VpscOverlapRemover(set.count);
      remover.removeOverlaps(set.x, set.y, set.halfW, set.halfH, set.count);

      expect(overlappingPairs(set)).toBe(0);
    }
  });

  it("resolves a heavy uniform-size pile-up (all centres at the origin)", () => {
    const count = 200;
    const set: RectSet = {
      x: new Float32Array(count),
      y: new Float32Array(count),
      halfW: new Float32Array(count).fill(5),
      halfH: new Float32Array(count).fill(5),
      count,
    };

    new VpscOverlapRemover(count).removeOverlaps(
      set.x,
      set.y,
      set.halfW,
      set.halfH,
      count,
    );

    expect(overlappingPairs(set)).toBe(0);
  });

  it("resolves mixed-size overlaps", () => {
    const set = randomRects(600, 99, true);
    // A few deliberately large rectangles swallowing many small ones.
    for (const big of [0, 10, 20, 30]) {
      set.halfW[big] = 40;
      set.halfH[big] = 40;
    }
    new VpscOverlapRemover(set.count).removeOverlaps(
      set.x,
      set.y,
      set.halfW,
      set.halfH,
      set.count,
    );
    expect(overlappingPairs(set)).toBe(0);
  });

  it("is deterministic (same input ⇒ identical output)", () => {
    const first = randomRects(500, 12345);
    const second = clone(first);

    new VpscOverlapRemover(first.count).removeOverlaps(
      first.x,
      first.y,
      first.halfW,
      first.halfH,
      first.count,
    );
    new VpscOverlapRemover(second.count).removeOverlaps(
      second.x,
      second.y,
      second.halfW,
      second.halfH,
      second.count,
    );

    expect([...first.x]).toEqual([...second.x]);
    expect([...first.y]).toEqual([...second.y]);
  });

  it("reuses one instance across differently sized inputs", () => {
    const remover = new VpscOverlapRemover(64);
    for (const [count, seed] of [
      [50, 1],
      [300, 2],
      [120, 3],
    ] as const) {
      const set = randomRects(count, seed);
      remover.removeOverlaps(set.x, set.y, set.halfW, set.halfH, set.count);
      expect(overlappingPairs(set)).toBe(0);
    }
  });

  it("stays close to webcola's displacement (oracle)", () => {
    for (const seed of [4, 8, 15, 16, 23]) {
      const source = randomRects(300, seed);
      const origX = Float32Array.from(source.x);
      const origY = Float32Array.from(source.y);

      const ours = clone(source);
      new VpscOverlapRemover(ours.count).removeOverlaps(
        ours.x,
        ours.y,
        ours.halfW,
        ours.halfH,
        ours.count,
      );
      expect(overlappingPairs(ours)).toBe(0);

      const rects = new Array<Rectangle>(source.count);
      for (let index = 0; index < source.count; index++) {
        rects[index] = new Rectangle(
          origX[index]! - source.halfW[index]!,
          origX[index]! + source.halfW[index]!,
          origY[index]! - source.halfH[index]!,
          origY[index]! + source.halfH[index]!,
        );
      }
      colaRemoveOverlaps(rects);
      const cola: RectSet = clone(source);
      for (let index = 0; index < source.count; index++) {
        cola.x[index] = rects[index]!.cx();
        cola.y[index] = rects[index]!.cy();
      }

      const oursTotal = totalDisplacement(ours, origX, origY);
      const colaTotal = totalDisplacement(cola, origX, origY);
      // Same algorithm as webcola, so displacement should be within a small margin.
      expect(oursTotal).toBeLessThanOrEqual(colaTotal * 1.2 + 1);
    }
  });

  it("handles a realistic n=5000 layout quickly (performance smoke)", () => {
    // Overlap removal runs on an already-settled layout, where nodes are mostly spread
    // and only local clusters overlap — not a solid pile-up. Spread the rectangles so a
    // realistic fraction (~1.4k pairs here) overlap; a fully-packed pile-up is an order
    // of magnitude slower but never occurs after the stress solver has run.
    const set = randomRects(5000, 2024, true, 40);
    expect(overlappingPairs(set)).toBeGreaterThan(0);

    const remover = new VpscOverlapRemover(set.count);
    const start = performance.now();
    remover.removeOverlaps(set.x, set.y, set.halfW, set.halfH, set.count);
    const elapsed = performance.now() - start;

    expect(overlappingPairs(set)).toBe(0);
    // Typically ~30ms on this fixture; the generous bound only guards against a gross
    // (e.g. accidental O(n²)) regression without flaking on a slow CI machine.
    expect(elapsed).toBeLessThan(200);
  });

  it("leaves already-separated rectangles untouched", () => {
    const count = 25;
    const set: RectSet = {
      x: new Float32Array(count),
      y: new Float32Array(count),
      halfW: new Float32Array(count).fill(2),
      halfH: new Float32Array(count).fill(2),
      count,
    };
    for (let index = 0; index < count; index++) {
      set.x[index] = (index % 5) * 100;
      set.y[index] = Math.floor(index / 5) * 100;
    }
    const beforeX = Float32Array.from(set.x);
    const beforeY = Float32Array.from(set.y);

    new VpscOverlapRemover(count).removeOverlaps(
      set.x,
      set.y,
      set.halfW,
      set.halfH,
      count,
    );

    expect([...set.x]).toEqual([...beforeX]);
    expect([...set.y]).toEqual([...beforeY]);
  });
});
