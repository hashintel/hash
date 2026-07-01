// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import {
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
  FlatGraphBuffer,
} from "../buffers/position-buffer";
import { countOverlaps } from "./overlap-relax";
import { createStressLayout } from "./stress-layout";

import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

function settle(layout: LayoutSimulation): void {
  for (let step = 0; step < 4000 && !layout.isSettled; step++) {
    layout.tick(50);
  }
}

function positionsOf(layout: LayoutSimulation): [number, number][] {
  return layout.nodes.map((node) => [node.x ?? 0, node.y ?? 0]);
}

/** Count disk-overlapping pairs in a settled layout (centres closer than r_i + r_j + padding). */
function overlapCountOf(layout: LayoutSimulation, padding = 0): number {
  const count = layout.nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (const [index, node] of layout.nodes.entries()) {
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }
  return countOverlaps({ x, y, radii, count, padding });
}

function makeNodes(count: number): ForceNode[] {
  const nodes: ForceNode[] = [];
  for (let idx = 0; idx < count; idx++) {
    nodes.push({ id: String(idx), x: idx * 7, y: (idx % 3) * 5, radius: 4 });
  }
  return nodes;
}

function layoutOf(nodes: ForceNode[], edges: ForceEdge[]): LayoutSimulation {
  return createStressLayout(nodes, edges, new FlatGraphBuffer(nodes.length));
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

describe("createStressLayout", () => {
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

  it("spreads nodes out (fused overlap term) rather than piling them", () => {
    const nodes = makeNodes(12);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "2", target: "3", weight: 1 },
      { source: "4", target: "5", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    const positions = positionsOf(layout);
    for (let lhs = 0; lhs < positions.length; lhs++) {
      for (let rhs = lhs + 1; rhs < positions.length; rhs++) {
        // Radius 4 each → centres must not be coincident (overlap relaxation spacing).
        expect(distanceBetween(positions, lhs, rhs)).toBeGreaterThan(4);
      }
    }
  });

  it("pulls a linked pair closer than the graph's overall spread", () => {
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
  });

  it("detects Louvain communities (two cliques joined by a bridge → 2)", () => {
    const nodes = makeNodes(6);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "0", target: "2", weight: 1 },
      { source: "3", target: "4", weight: 1 },
      { source: "4", target: "5", weight: 1 },
      { source: "3", target: "5", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    const communities = layout.communities!;
    expect(communities).toHaveLength(6);
    expect(new Set(communities).size).toBe(2);
    expect(communities[0]).toBe(communities[1]);
    expect(communities[0]).toBe(communities[2]);
    expect(communities[3]).toBe(communities[4]);
    expect(communities[3]).toBe(communities[5]);
    expect(communities[0]).not.toBe(communities[3]);
  });

  it("is deterministic for identical inputs (seeded SGD + overlap)", () => {
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
      expect(firstPositions[idx]![0]).toBeCloseTo(secondPositions[idx]![0], 2);
      expect(firstPositions[idx]![1]).toBeCloseTo(secondPositions[idx]![1], 2);
    }
  });

  it("warm-absorbs a new node in place (incremental, no restart)", () => {
    const nodes = makeNodes(5);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "3", target: "4", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);
    expect(layout.nodes.length).toBe(5);

    const newNode: ForceNode = { id: "5", x: 0, y: 0, radius: 4 };
    layout.absorb!(
      [newNode],
      [...edges, { source: "0", target: "5", weight: 1 }],
    );
    expect(layout.isSettled).toBe(false);

    settle(layout);
    expect(layout.nodes.length).toBe(6);
    expect(layout.communities!).toHaveLength(6);

    const positions = positionsOf(layout);
    for (const [posX, posY] of positions) {
      expect(Number.isFinite(posX)).toBe(true);
      expect(Number.isFinite(posY)).toBe(true);
    }
    const indexOfId = (id: string): number => layout.nodeIds.indexOf(id);
    expect(
      distanceBetween(positions, indexOfId("5"), indexOfId("0")),
    ).toBeLessThan(distanceBetween(positions, indexOfId("5"), indexOfId("3")));
  });

  it("grows the SAB without losing state (ensureCapacity + absorb)", () => {
    const nodes = makeNodes(4);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const buffer = new FlatGraphBuffer(4, () => {});
    const layout = createStressLayout(nodes, edges, buffer);
    settle(layout);

    buffer.ensureCapacity(8);
    layout.absorb!(
      [{ id: "4", x: 0, y: 0, radius: 4 }],
      [...edges, { source: "0", target: "4", weight: 1 }],
    );
    settle(layout);

    expect(layout.nodes.length).toBe(5);
    const view = new Float32Array(buffer.raw, FLAT_HEADER_BYTES);
    const slots = FLAT_RECORD_BYTES / 4;
    const node4 = layout.nodes[4]!;
    expect(view[4 * slots]).toBeCloseTo(node4.x ?? 0, 3);
    expect(view[4 * slots + 1]).toBeCloseTo(node4.y ?? 0, 3);
  });

  it("settles a dense hub (1 + 120 leaves) with zero disk overlaps", () => {
    const count = 121;
    const nodes = makeNodes(count);
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < count; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }
    const layout = layoutOf(nodes, edges);
    settle(layout);

    expect(layout.isSettled).toBe(true);
    // The soft fused term alone leaves residual overlaps around the hub; the terminal
    // VPSC projection must drive them to exactly zero.
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  it("also removes overlaps after a warm absorb (terminal projection re-runs)", () => {
    const nodes = makeNodes(40);
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < 40; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }
    const layout = layoutOf(nodes, edges);
    settle(layout);
    expect(overlapCountOf(layout, 0)).toBe(0);

    const newNodes: ForceNode[] = [];
    const grownEdges: ForceEdge[] = [...edges];
    for (let id = 40; id < 90; id++) {
      newNodes.push({ id: String(id), x: 0, y: 0, radius: 4 });
      grownEdges.push({ source: "0", target: String(id), weight: 1 });
    }
    layout.absorb!(newNodes, grownEdges);
    settle(layout);

    expect(layout.isSettled).toBe(true);
    expect(layout.nodes.length).toBe(90);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  it("interleaved overlap removal also ends overlap-free", () => {
    const count = 121;
    const nodes = makeNodes(count);
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < count; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }
    const layout = createStressLayout(
      nodes,
      edges,
      new FlatGraphBuffer(nodes.length),
      { overlapRemovalInterval: 10 },
    );
    settle(layout);

    expect(layout.isSettled).toBe(true);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  it("re-globalises (refreshes Louvain communities) after significant growth", () => {
    const nodes = makeNodes(6);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "3", target: "4", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    const newNodes: ForceNode[] = [];
    const grownEdges: ForceEdge[] = [...edges];
    for (let id = 6; id < 36; id++) {
      newNodes.push({ id: String(id), x: 0, y: 0, radius: 4 });
      grownEdges.push({
        source: String(id),
        target: String(id % 6),
        weight: 1,
      });
    }
    layout.absorb!(newNodes, grownEdges);
    settle(layout);

    expect(layout.nodes.length).toBe(36);
    const communities = layout.communities!;
    expect(communities).toHaveLength(36);
    expect(communities.every((community) => community >= 0)).toBe(true);
  });
});
