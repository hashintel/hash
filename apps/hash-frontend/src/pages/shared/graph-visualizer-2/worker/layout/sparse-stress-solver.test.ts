/* eslint-disable id-length */
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { countOverlaps } from "./overlap-relax";
import { SparseStressSolver } from "./sparse-stress-solver";

import type { SparseStressSolverOptions } from "./sparse-stress-solver";

const finiteCoords = (x: Float32Array, y: Float32Array): void => {
  for (let i = 0; i < x.length; i++) {
    expect(Number.isFinite(x[i])).toBe(true);
    expect(Number.isFinite(y[i])).toBe(true);
  }
};

/** A path graph 0-1-2-...-(n-1); an easy layout that settles quickly. */
const pathGraph = (n: number): { src: Uint32Array; dst: Uint32Array } => {
  const src = new Uint32Array(Math.max(0, n - 1));
  const dst = new Uint32Array(Math.max(0, n - 1));
  for (let i = 0; i < n - 1; i++) {
    src[i] = i;
    dst[i] = i + 1;
  }
  return { src, dst };
};

/**
 * A "double star": `leaves` middle nodes each linked to BOTH hubs. Every leaf sits at
 * the same graph distance from everything, so pure stress collapses them onto one point
 * (heavy overlap) — the fused proximity term is what must spread them.
 */
const doubleStar = (
  leaves: number,
): { n: number; src: Uint32Array; dst: Uint32Array } => {
  const n = leaves + 2;
  const hubA = 0;
  const hubB = leaves + 1;
  const src = new Uint32Array(leaves * 2);
  const dst = new Uint32Array(leaves * 2);
  for (let leaf = 0; leaf < leaves; leaf++) {
    const node = leaf + 1;
    src[leaf * 2] = hubA;
    dst[leaf * 2] = node;
    src[leaf * 2 + 1] = node;
    dst[leaf * 2 + 1] = hubB;
  }
  return { n, src, dst };
};

const solve = (
  n: number,
  src: Uint32Array,
  dst: Uint32Array,
  options: SparseStressSolverOptions,
  radii?: Float32Array,
): { x: Float32Array; y: Float32Array; epochs: number } => {
  const result = new SparseStressSolver({ n, src, dst, radii }, options).run();
  return { x: result.x, y: result.y, epochs: result.epochs };
};

/** Normalized RMS deviation of edge lengths from `ideal` (lower is better). */
const edgeStress = (
  x: Float32Array,
  y: Float32Array,
  src: Uint32Array,
  dst: Uint32Array,
  ideal: number,
): number => {
  let sum = 0;
  for (let e = 0; e < src.length; e++) {
    const u = src[e]!;
    const v = dst[e]!;
    const length = Math.hypot(x[v]! - x[u]!, y[v]! - y[u]!);
    const ratio = length / ideal - 1;
    sum += ratio * ratio;
  }
  return src.length > 0 ? Math.sqrt(sum / src.length) : 0;
};

describe("SparseStressSolver", () => {
  it("is deterministic for identical inputs (seeded SGD + fused overlap)", () => {
    const { n, src, dst } = doubleStar(20);
    const radii = new Float32Array(n).fill(6);
    const options: SparseStressSolverOptions = {
      idealEdgeLength: 40,
      overlapPadding: 2,
    };

    const first = solve(n, src, dst, options, radii.slice());
    const second = solve(n, src, dst, options, radii.slice());

    for (let i = 0; i < n; i++) {
      expect(first.x[i]).toBe(second.x[i]);
      expect(first.y[i]).toBe(second.y[i]);
    }
  });

  it("stops adaptively before the max-epoch horizon on an easy graph", () => {
    const n = 24;
    const { src, dst } = pathGraph(n);
    const { epochs } = solve(n, src, dst, {
      idealEdgeLength: 40,
      minEpochs: 4,
      maxEpochs: 80,
      convergenceEpsilon: 1e-2,
    });

    expect(epochs).toBeGreaterThanOrEqual(4);
    expect(epochs).toBeLessThan(80);
  });

  it("honours a fixed epoch count when `epochs` is supplied", () => {
    const n = 24;
    const { src, dst } = pathGraph(n);
    const { epochs } = solve(n, src, dst, { idealEdgeLength: 40, epochs: 17 });

    expect(epochs).toBe(17);
  });

  it("fused overlap term resolves the pile-ups that pure stress leaves behind", () => {
    const { n, src, dst } = doubleStar(30);
    const radii = new Float32Array(n).fill(6);
    const base: SparseStressSolverOptions = {
      idealEdgeLength: 40,
      maxEpochs: 80,
    };

    // Pure stress (no radii) collapses the symmetric leaves onto one point.
    const pure = solve(n, src, dst, base);
    // Same solve with the fused proximity term active (radii + a firm weight).
    const fused = solve(
      n,
      src,
      dst,
      { ...base, overlapPadding: 4, overlapWeight: 8 },
      radii.slice(),
    );

    const overlapArgs = { radii, count: n, padding: 0 } as const;
    const pureOverlaps = countOverlaps({
      x: pure.x,
      y: pure.y,
      ...overlapArgs,
    });
    const fusedOverlaps = countOverlaps({
      x: fused.x,
      y: fused.y,
      ...overlapArgs,
    });

    // This is a deliberately adversarial pile-up (full separation is geometrically
    // impossible without stretching edges), but the fused term must still clear the
    // large majority of the overlaps pure stress leaves behind.
    expect(pureOverlaps).toBeGreaterThan(50);
    expect(fusedOverlaps).toBeLessThan(pureOverlaps * 0.5);
  });

  it("keeps edge lengths near ideal while resolving overlap", () => {
    const n = 40;
    const { src, dst } = pathGraph(n);
    const radii = new Float32Array(n).fill(5);
    const { x, y } = solve(
      n,
      src,
      dst,
      { idealEdgeLength: 40, overlapPadding: 2, maxEpochs: 80 },
      radii,
    );

    finiteCoords(x, y);
    expect(edgeStress(x, y, src, dst, 40)).toBeLessThan(1.5);
  });

  it("handles empty and tiny graphs", () => {
    const empty = new SparseStressSolver({
      n: 0,
      src: new Uint32Array(0),
      dst: new Uint32Array(0),
    }).run();
    expect(empty.x.length).toBe(0);

    const single = new SparseStressSolver({
      n: 1,
      src: new Uint32Array(0),
      dst: new Uint32Array(0),
    }).run();
    expect(single.x.length).toBe(1);
    finiteCoords(single.x, single.y);

    const pair = new SparseStressSolver(
      { n: 2, src: new Uint32Array([0]), dst: new Uint32Array([1]) },
      { idealEdgeLength: 40 },
    ).run();
    finiteCoords(pair.x, pair.y);
    expect(
      Math.hypot(pair.x[1]! - pair.x[0]!, pair.y[1]! - pair.y[0]!),
    ).toBeGreaterThan(0);
  });

  it("warm-continues from supplied positions (keepInitialPositions)", () => {
    const x = new Float32Array([10, 20]);
    const y = new Float32Array([5, 9]);

    const result = new SparseStressSolver(
      { n: 2, src: new Uint32Array([0]), dst: new Uint32Array([1]), x, y },
      {
        epochs: 0,
        jitter: 0,
        keepInitialPositions: true,
        packComponents: false,
      },
    ).run();

    expect(result.x[1]! - result.x[0]!).toBeCloseTo(10, 5);
    expect(result.y[1]! - result.y[0]!).toBeCloseTo(4, 5);
  });
});
