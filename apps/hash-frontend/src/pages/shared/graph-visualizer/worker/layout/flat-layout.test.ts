import { describe, expect, it } from "vitest";

import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createFlatLayout } from "./flat-layout";

import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

function settle(layout: LayoutSimulation): void {
  for (let step = 0; step < 1000 && !layout.isSettled; step++) {
    layout.tick(50);
  }
}

function positionsOf(layout: LayoutSimulation): [number, number][] {
  return layout.nodes.map((node) => [node.x ?? 0, node.y ?? 0]);
}

function makeNodes(count: number): ForceNode[] {
  const nodes: ForceNode[] = [];
  for (let idx = 0; idx < count; idx++) {
    // Distinct deterministic seeds (not all stacked on the origin).
    nodes.push({ id: String(idx), x: idx * 7, y: (idx % 3) * 5, radius: 4 });
  }
  return nodes;
}

function layoutOf(nodes: ForceNode[], edges: ForceEdge[]): LayoutSimulation {
  return createFlatLayout(nodes, edges, new FlatGraphBuffer(nodes.length));
}

function distanceBetween(
  positions: readonly [number, number][],
  lhs: number,
  rhs: number,
): number {
  return Math.hypot(
    positions[lhs]![0] - positions[rhs]![0],
    positions[lhs]![1] - positions[rhs]![1],
  );
}

describe("createFlatLayout", () => {
  it("settles, stays finite, and re-centres on the origin", () => {
    const nodes = makeNodes(8);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    expect(layout.isSettled).toBe(true);
    const positions = positionsOf(layout);
    let sumX = 0;
    let sumY = 0;
    for (const [posX, posY] of positions) {
      expect(Number.isFinite(posX)).toBe(true);
      expect(Number.isFinite(posY)).toBe(true);
      sumX += posX;
      sumY += posY;
    }
    expect(Math.abs(sumX / positions.length)).toBeLessThan(1);
    expect(Math.abs(sumY / positions.length)).toBeLessThan(1);
  });

  it("does not pile nodes on top of each other", () => {
    const nodes = makeNodes(10);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    const positions = positionsOf(layout);
    for (let lhs = 0; lhs < positions.length; lhs++) {
      for (let rhs = lhs + 1; rhs < positions.length; rhs++) {
        // Radius 4 each → centres must be clearly apart (non-overlap box).
        expect(distanceBetween(positions, lhs, rhs)).toBeGreaterThan(4);
      }
    }
  });

  it("pulls a linked pair closer than the graph's overall spread", () => {
    // Path 0-1-2-3-4: adjacent nodes sit near the ideal length; ends far apart.
    const nodes = makeNodes(5);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "2", target: "3", weight: 1 },
      { source: "3", target: "4", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    const positions = positionsOf(layout);
    expect(distanceBetween(positions, 0, 1)).toBeLessThan(
      distanceBetween(positions, 0, 4),
    );
    expect(distanceBetween(positions, 3, 4)).toBeLessThan(
      distanceBetween(positions, 0, 4),
    );
  });

  it("is deterministic for identical seed positions", () => {
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const first = layoutOf(makeNodes(4), [...edges]);
    const second = layoutOf(makeNodes(4), [...edges]);
    settle(first);
    settle(second);

    const firstPositions = positionsOf(first);
    const secondPositions = positionsOf(second);
    for (let idx = 0; idx < firstPositions.length; idx++) {
      expect(firstPositions[idx]![0]).toBeCloseTo(secondPositions[idx]![0], 4);
      expect(firstPositions[idx]![1]).toBeCloseTo(secondPositions[idx]![1], 4);
    }
  });

  // Perf probe (skipped; ~6.6s). cola's Descent is the small-N (flat-force)
  // engine; this confirms it stays robust at the TOP of its range (1000 nodes in
  // one connected component is the worst case for its O(N^2) (real data is many
  // small components, far faster). The community-force tier uses the majorization
  // engine; a different engine for a different scale, not a fallback for when
  // this is slow. Un-skip to re-benchmark.
  it.skip("settles ~1000 nodes (worst case: one connected component) and times it", () => {
    const count = 1000;
    const nodes: ForceNode[] = [];
    for (let idx = 0; idx < count; idx++) {
      nodes.push({
        id: String(idx),
        x: (idx % 40) * 20,
        y: Math.floor(idx / 40) * 20,
        radius: 5,
      });
    }

    // One connected component (chain + cross-links): a fully-connected graph is
    // the WORST case for cola's O(N^2) (dense distance matrix, slow convergence).
    // Heavier than the real many-small-components data.
    const edges: ForceEdge[] = [];
    for (let idx = 1; idx < count; idx++) {
      edges.push({ source: String(idx - 1), target: String(idx), weight: 1 });
      if (idx >= 7) {
        edges.push({ source: String(idx - 7), target: String(idx), weight: 1 });
      }
    }

    const start = performance.now();
    const layout = createFlatLayout(nodes, edges, new FlatGraphBuffer(count));
    let batches = 0;
    while (!layout.isSettled && batches < 2000) {
      layout.tick(1000);
      batches += 1;
    }
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(
      `[bench] ${count} nodes / ${edges.length} edges (connected) -> settle ` +
        `${elapsed.toFixed(0)}ms over ${batches} batches`,
    );
    expect(layout.isSettled).toBe(true);
  }, 120000);
});
