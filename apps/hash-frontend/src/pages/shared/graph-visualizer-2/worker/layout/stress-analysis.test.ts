/**
 * Tests for the graph-analysis pipeline (CSR → weak components → pivot BFS rows →
 * PivotMDS init → component packing) that feeds the majorization engine.
 *
 * Ported from the deleted SGD solver's test suite (sparse-stress-solver.test.ts):
 * the analysis-stage behaviors — determinism, empty/tiny graph handling, warm
 * continuation from supplied positions — survive here. The SGD-specific gates
 * (epoch adaptivity, fused overlap term, community/degree force terms) died with
 * the solver; their user-visible behaviors are gated at the engine level in
 * majorization-layout.test.ts / majorization-layout.perf.test.ts instead.
 */
import { describe, expect, it } from "vitest";

import { StressAnalysis } from "./stress-analysis";

import type { StressAnalysisOptions } from "./stress-analysis";

const expectFiniteCoords = (x: Float32Array, y: Float32Array): void => {
  for (let index = 0; index < x.length; index++) {
    expect(Number.isFinite(x[index])).toBe(true);
    expect(Number.isFinite(y[index])).toBe(true);
  }
};

/** A path graph 0-1-2-...-(n-1). */
const pathGraph = (
  nodeCount: number,
): { src: Uint32Array; dst: Uint32Array } => {
  const src = new Uint32Array(Math.max(0, nodeCount - 1));
  const dst = new Uint32Array(Math.max(0, nodeCount - 1));
  for (let index = 0; index < nodeCount - 1; index++) {
    src[index] = index;
    dst[index] = index + 1;
  }
  return { src, dst };
};

const analyse = (
  nodeCount: number,
  src: Uint32Array,
  dst: Uint32Array,
  options: StressAnalysisOptions = {},
) => new StressAnalysis({ n: nodeCount, src, dst }, options).run();

describe("StressAnalysis", () => {
  it("is deterministic for identical inputs (seeded init, no sampling)", () => {
    const { src, dst } = pathGraph(120);
    const first = analyse(120, src, dst, { idealEdgeLength: 30 });
    const second = analyse(120, src, dst, { idealEdgeLength: 30 });

    expect(first.x).toEqual(second.x);
    expect(first.y).toEqual(second.y);
    expect(first.pivots.pivots).toEqual(second.pivots.pivots);
    expect(first.pivots.distances).toEqual(second.pivots.distances);
  });

  it("produces the same result under budget-sliced ticking as under run()", () => {
    const { src, dst } = pathGraph(200);
    const whole = analyse(200, src, dst, { idealEdgeLength: 24 });

    const sliced = new StressAnalysis(
      { n: 200, src, dst },
      { idealEdgeLength: 24 },
    );
    let guard = 0;
    while (!sliced.tick({ maxWork: 64 }).done) {
      guard += 1;
      expect(guard).toBeLessThan(10_000);
    }

    expect(sliced.result!.x).toEqual(whole.x);
    expect(sliced.result!.y).toEqual(whole.y);
  });

  it("spreads a path graph out (PivotMDS init, no collapse)", () => {
    const nodeCount = 64;
    const { src, dst } = pathGraph(nodeCount);
    const result = analyse(nodeCount, src, dst, { idealEdgeLength: 30 });

    expectFiniteCoords(result.x, result.y);
    // Endpoints of the path must land far apart relative to adjacent nodes.
    const endToEnd = Math.hypot(
      result.x[nodeCount - 1]! - result.x[0]!,
      result.y[nodeCount - 1]! - result.y[0]!,
    );
    const adjacent = Math.hypot(
      result.x[1]! - result.x[0]!,
      result.y[1]! - result.y[0]!,
    );
    expect(endToEnd).toBeGreaterThan(adjacent * 5);
  });

  it("exposes exact BFS rows for the pivots (what the term builder samples)", () => {
    const nodeCount = 40;
    const { src, dst } = pathGraph(nodeCount);
    const result = analyse(nodeCount, src, dst);

    const { pivots, distances } = result.pivots;
    expect(pivots.length).toBeGreaterThan(0);
    for (const [row, pivot] of pivots.entries()) {
      for (let node = 0; node < nodeCount; node++) {
        // On a path graph the BFS distance is |pivot − node|.
        expect(distances[row * nodeCount + node]).toBe(Math.abs(pivot - node));
      }
    }
  });

  it("labels weak components and packs them apart", () => {
    // Two disjoint 10-node paths.
    const nodeCount = 20;
    const src = new Uint32Array(18);
    const dst = new Uint32Array(18);
    for (let index = 0; index < 9; index++) {
      src[index] = index;
      dst[index] = index + 1;
      src[index + 9] = 10 + index;
      dst[index + 9] = 10 + index + 1;
    }
    const result = analyse(nodeCount, src, dst, { idealEdgeLength: 20 });

    expect(result.components.count).toBe(2);
    const labels = result.components.labels;
    expect(new Set(labels.subarray(0, 10)).size).toBe(1);
    expect(new Set(labels.subarray(10)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[10]);

    // Packing must separate the two components' bounding boxes.
    const bounds = (from: number, to: number) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let index = from; index < to; index++) {
        minX = Math.min(minX, result.x[index]!);
        maxX = Math.max(maxX, result.x[index]!);
        minY = Math.min(minY, result.y[index]!);
        maxY = Math.max(maxY, result.y[index]!);
      }
      return { minX, maxX, minY, maxY };
    };
    const first = bounds(0, 10);
    const second = bounds(10, 20);
    const disjointX = first.maxX < second.minX || second.maxX < first.minX;
    const disjointY = first.maxY < second.minY || second.maxY < first.minY;
    expect(disjointX || disjointY).toBe(true);
  });

  it("handles empty and tiny graphs", () => {
    const empty = analyse(0, new Uint32Array(0), new Uint32Array(0));
    expect(empty.x.length).toBe(0);

    const single = analyse(1, new Uint32Array(0), new Uint32Array(0));
    expect(single.x.length).toBe(1);
    expectFiniteCoords(single.x, single.y);

    const pair = analyse(2, new Uint32Array([0]), new Uint32Array([1]), {
      idealEdgeLength: 40,
    });
    expectFiniteCoords(pair.x, pair.y);
    expect(
      Math.hypot(pair.x[1]! - pair.x[0]!, pair.y[1]! - pair.y[0]!),
    ).toBeGreaterThan(0);
  });

  it("warm-continues from supplied positions (keepInitialPositions)", () => {
    const x = new Float32Array([10, 20]);
    const y = new Float32Array([5, 9]);

    const result = new StressAnalysis(
      { n: 2, src: new Uint32Array([0]), dst: new Uint32Array([1]), x, y },
      { jitter: 0, keepInitialPositions: true, packComponents: false },
    ).run();

    expect(result.x[1]! - result.x[0]!).toBeCloseTo(10, 5);
    expect(result.y[1]! - result.y[0]!).toBeCloseTo(4, 5);
  });
});
