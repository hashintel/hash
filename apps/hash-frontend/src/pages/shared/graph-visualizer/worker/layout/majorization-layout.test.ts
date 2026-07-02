import { describe, expect, it } from "vitest";
import { Layout } from "webcola";

import { buildForceGraphWithCoincidentHub } from "../bench-fixtures";
import {
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
  FlatGraphBuffer,
} from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";
import { countOverlaps } from "./overlap-relax";

import type { GraphShape } from "../bench-fixtures";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";
import type { InputNode, Link, Node as ColaNode } from "webcola";

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
  return createMajorizationLayout(
    nodes,
    edges,
    new FlatGraphBuffer(nodes.length),
  );
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

/** Normalised edge stress: mean over edges of ((len − ideal) / ideal)². */
function edgeStressOf(
  layout: LayoutSimulation,
  edges: readonly ForceEdge[],
  ideal: number,
): number {
  const indexOfId = new Map<string, number>();
  for (const [index, node] of layout.nodes.entries()) {
    indexOfId.set(node.id, index);
  }
  const positions = positionsOf(layout);
  let sum = 0;
  let count = 0;
  for (const edge of edges) {
    const source = indexOfId.get(
      typeof edge.source === "string" ? edge.source : edge.source.id,
    );
    const target = indexOfId.get(
      typeof edge.target === "string" ? edge.target : edge.target.id,
    );
    if (source === undefined || target === undefined || source === target) {
      continue;
    }
    const len = distanceBetween(positions, source, target);
    const rel = (len - ideal) / ideal;
    sum += rel * rel;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

describe("createMajorizationLayout", () => {
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

  it("separates all disks (overlap projection) rather than piling them", () => {
    const nodes = makeNodes(12);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "2", target: "3", weight: 1 },
      { source: "4", target: "5", weight: 1 },
    ];
    const layout = layoutOf(nodes, edges);
    settle(layout);

    expect(overlapCountOf(layout, 0)).toBe(0);
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

  it("is deterministic for identical inputs (no stochastic sampling)", () => {
    const shape: GraphShape = {
      nodeCount: 300,
      linkCount: 500,
      typeCount: 1,
      hubCount: 4,
      rootFraction: 1,
      seed: 11,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 40);
    const first = createMajorizationLayout(
      nodes.map((node) => ({ ...node })),
      [...edges],
      new FlatGraphBuffer(nodes.length),
    );
    const second = createMajorizationLayout(
      nodes.map((node) => ({ ...node })),
      [...edges],
      new FlatGraphBuffer(nodes.length),
    );
    settle(first);
    settle(second);

    const firstPositions = positionsOf(first);
    const secondPositions = positionsOf(second);
    for (let idx = 0; idx < firstPositions.length; idx++) {
      expect(firstPositions[idx]![0]).toBe(secondPositions[idx]![0]);
      expect(firstPositions[idx]![1]).toBe(secondPositions[idx]![1]);
    }
  });

  it("warm-absorbs a new node in place (incremental, no restart)", () => {
    const nodes = makeNodes(5);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "1", target: "2", weight: 1 },
      { source: "3", target: "4", weight: 1 },
    ];
    const buffer = new FlatGraphBuffer(8, () => {});
    const layout = createMajorizationLayout(nodes, edges, buffer);
    settle(layout);
    expect(layout.nodes.length).toBe(5);

    // Place the newcomer near an existing node to mimic incremental graph growth (warm absorb).
    const anchor = layout.nodes.find((node) => node.id === "0")!;
    const newNode: ForceNode = {
      id: "5",
      x: (anchor.x ?? 0) + 10,
      y: (anchor.y ?? 0) + 10,
      radius: 4,
    };
    layout.absorb!(
      [newNode],
      [...edges, { source: "0", target: "5", weight: 1 }],
    );
    expect(layout.isSettled).toBe(false);

    settle(layout);
    expect(layout.nodes.length).toBe(6);
    expect(layout.communities!).toHaveLength(6);
    expect(overlapCountOf(layout, 0)).toBe(0);

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

  it("keeps settled nodes near their positions across a warm absorb", () => {
    const shape: GraphShape = {
      nodeCount: 200,
      linkCount: 320,
      typeCount: 1,
      hubCount: 4,
      rootFraction: 1,
      seed: 21,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 30);
    const buffer = new FlatGraphBuffer(nodes.length + 8, () => {});
    const layout = createMajorizationLayout(nodes, edges, buffer);
    settle(layout);

    const before = new Map<string, readonly [number, number]>(
      layout.nodes.map((node) => [node.id, [node.x ?? 0, node.y ?? 0]]),
    );
    const anchor = layout.nodes.find((node) => node.id === "0")!;
    layout.absorb!(
      [
        {
          id: "new-a",
          x: (anchor.x ?? 0) + 8,
          y: (anchor.y ?? 0) + 8,
          radius: 4,
        },
      ],
      [...edges, { source: "0", target: "new-a", weight: 1 }],
    );
    settle(layout);

    // Warm start: the bulk of the layout must not teleport. Allow local motion
    // (the absorb re-solves globally) but demand a small median displacement.
    const displacements: number[] = [];
    for (const node of layout.nodes) {
      const previous = before.get(node.id);
      if (previous) {
        displacements.push(
          Math.hypot((node.x ?? 0) - previous[0], (node.y ?? 0) - previous[1]),
        );
      }
    }
    displacements.sort((a, b) => a - b);
    const median = displacements[Math.floor(displacements.length / 2)]!;
    expect(median).toBeLessThan(60);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  it("grows the SAB without losing state (ensureCapacity + absorb)", () => {
    const nodes = makeNodes(4);
    const edges: ForceEdge[] = [
      { source: "0", target: "1", weight: 1 },
      { source: "2", target: "3", weight: 1 },
    ];
    const buffer = new FlatGraphBuffer(4, () => {});
    const layout = createMajorizationLayout(nodes, edges, buffer);
    settle(layout);

    buffer.ensureCapacity(8);
    layout.absorb!(
      [{ id: "4", x: 3, y: 3, radius: 4 }],
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

  it("settles a dense hub (1 + 120 coincident leaves) with zero disk overlaps", () => {
    const count = 121;
    const nodes: ForceNode[] = [];
    // All nodes start essentially coincident (the production pathology).
    for (let idx = 0; idx < count; idx++) {
      nodes.push({
        id: String(idx),
        x: (idx % 5) * 0.25,
        y: (idx % 7) * 0.25,
        radius: 4,
      });
    }
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < count; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }
    const layout = layoutOf(nodes, edges);
    settle(layout);

    expect(layout.isSettled).toBe(true);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  // Densest single hub the suite gates (1 hub + 250 leaves).
  it("settles a very dense hub (1 + 250 leaves) overlap-free", () => {
    const count = 251;
    const nodes = makeNodes(count);
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < count; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }
    const layout = layoutOf(nodes, edges);
    settle(layout);

    expect(layout.isSettled).toBe(true);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  // Overlap resolution must re-run after a warm absorb, not only on the cold start.
  it("also removes overlaps after a bulk warm absorb (50 coincident newcomers)", () => {
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

  // Louvain labels must refresh once growth is significant, so the bubbles reflect the grown topology.
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

  /**
   * Regression: a settled-but-jammed 150-leaf hub must terminate under the
   * iteration cap with zero overlaps and without a capped exit.
   */
  it("livelock regression: a settled-but-jammed 150-leaf hub terminates in bounded iterations", () => {
    const shape: GraphShape = {
      nodeCount: 850,
      linkCount: 1_300,
      typeCount: 1,
      hubCount: 6,
      rootFraction: 1,
      seed: 31,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 150);
    const layout = layoutOf(nodes, edges);

    let ticks = 0;
    for (let step = 0; step < 20_000 && !layout.isSettled; step++) {
      layout.tick(1);
      ticks += 1;
    }

    // Duck-type layout diagnostics not on LayoutSimulation; createMajorizationLayout exposes these in tests.
    const diag = layout as unknown as {
      capped?: boolean;
      iterations?: number;
    };
    // eslint-disable-next-line no-console
    console.log(
      `[livelock-regression] ticks=${ticks} iterations=${diag.iterations} capped=${diag.capped}`,
    );

    expect(layout.isSettled).toBe(true);
    expect(diag.capped).toBe(false);
    expect(overlapCountOf(layout, 0)).toBe(0);
  });

  it("publishes only overlap-free frames once projection is active", () => {
    const shape: GraphShape = {
      nodeCount: 400,
      linkCount: 650,
      typeCount: 1,
      hubCount: 4,
      rootFraction: 1,
      seed: 41,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 80);
    const layout = layoutOf(nodes, edges);

    let checkedFrames = 0;
    for (let step = 0; step < 20_000 && !layout.isSettled; step++) {
      layout.tick(1);
      const projection = layout as unknown as { projectionActive?: boolean };
      if (projection.projectionActive) {
        // Assert overlap-freedom on the same node coordinates written to the
        // shared buffer each publish.
        expect(overlapCountOf(layout, 0)).toBe(0);
        checkedFrames += 1;
      }
    }

    expect(layout.isSettled).toBe(true);
    expect(checkedFrames).toBeGreaterThan(0);
  });

  it("keeps the community sliders meaningful (separation spreads cross-community pairs)", () => {
    const shape: GraphShape = {
      nodeCount: 220,
      linkCount: 380,
      typeCount: 1,
      hubCount: 4,
      rootFraction: 1,
      seed: 51,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 20);

    const makeLayout = (separation: number) => {
      const layout = createMajorizationLayout(
        nodes.map((node) => ({ ...node })),
        [...edges],
        new FlatGraphBuffer(nodes.length),
        { communitySeparation: separation },
      );
      settle(layout);
      return layout;
    };

    const gentle = makeLayout(0.02);
    const strong = makeLayout(0.8);

    /** Mean distance over cross-community linked pairs. */
    const crossCommunityMeanEdgeLength = (layout: LayoutSimulation) => {
      const communities = layout.communities!;
      const indexOfId = new Map<string, number>();
      for (const [index, node] of layout.nodes.entries()) {
        indexOfId.set(node.id, index);
      }
      const positions = positionsOf(layout);
      let sum = 0;
      let count = 0;
      for (const edge of edges) {
        const source = indexOfId.get(edge.source as string)!;
        const target = indexOfId.get(edge.target as string)!;
        if (communities[source] !== communities[target]) {
          sum += distanceBetween(positions, source, target);
          count += 1;
        }
      }
      return count > 0 ? sum / count : 0;
    };

    expect(crossCommunityMeanEdgeLength(strong)).toBeGreaterThan(
      crossCommunityMeanEdgeLength(gentle) * 1.15,
    );
  });

  // The degreeRepulsion slider must widen a high-degree hub's halo under majorization's target shaping.
  it("degree repulsion widens a high-degree hub's halo", () => {
    const count = 61;
    const nodes = makeNodes(count);
    const edges: ForceEdge[] = [];
    for (let leaf = 1; leaf < count; leaf++) {
      edges.push({ source: "0", target: String(leaf), weight: 1 });
    }

    const meanHubDistance = (layout: LayoutSimulation): number => {
      const positions = positionsOf(layout);
      const hub = layout.nodeIds.indexOf("0");
      let sum = 0;
      let sampled = 0;
      for (let leaf = 1; leaf < count; leaf++) {
        const index = layout.nodeIds.indexOf(String(leaf));
        sum += distanceBetween(positions, hub, index);
        sampled += 1;
      }
      return sum / sampled;
    };

    const makeLayout = (degreeRepulsion: number) => {
      const layout = createMajorizationLayout(
        nodes.map((node) => ({ ...node })),
        [...edges],
        new FlatGraphBuffer(nodes.length),
        { communityCohesion: 0, communitySeparation: 0, degreeRepulsion },
      );
      settle(layout);
      return layout;
    };

    const off = makeLayout(0);
    const on = makeLayout(0.25);

    expect(overlapCountOf(on, 0)).toBe(0);
    expect(meanHubDistance(on)).toBeGreaterThan(meanHubDistance(off) * 1.1);
  });

  it("matches the WebCola oracle at N ≤ 150 (comparable stress, zero overlaps)", () => {
    const shape: GraphShape = {
      nodeCount: 120,
      linkCount: 200,
      typeCount: 1,
      hubCount: 3,
      rootFraction: 1,
      seed: 61,
    };
    const { nodes, edges } = buildForceGraphWithCoincidentHub(shape, 20);
    expect(nodes.length).toBeLessThanOrEqual(150);

    const IDEAL = 60;
    const layout = createMajorizationLayout(
      nodes.map((node) => ({ ...node })),
      [...edges],
      new FlatGraphBuffer(nodes.length),
      // Pure-stress comparison: no community/degree shaping on either side.
      { communityCohesion: 0, communitySeparation: 0, degreeRepulsion: 0 },
    );
    settle(layout);
    expect(overlapCountOf(layout, 0)).toBe(0);

    // Oracle baseline: WebCola stress majorization with rectangle overlap removal.
    const indexOfId = new Map<string, number>(
      nodes.map((node, index) => [node.id, index]),
    );
    const colaNodes: InputNode[] = nodes.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.radius * 2,
      height: node.radius * 2,
    }));
    const colaLinks: Link<number>[] = [];
    for (const edge of edges) {
      const source = indexOfId.get(edge.source as string)!;
      const target = indexOfId.get(edge.target as string)!;
      if (source !== target) {
        colaLinks.push({ source, target, length: IDEAL });
      }
    }
    const cola = new (class extends Layout {
      runStep(): boolean {
        return this.tick();
      }
    })();
    cola
      .nodes(colaNodes)
      .links(colaLinks)
      .linkDistance((link: Link<number | ColaNode>) => link.length ?? IDEAL)
      .avoidOverlaps(true)
      .handleDisconnected(true)
      .start(0, 0, 0, 0, false);
    for (let step = 0; step < 2000; step++) {
      if (cola.runStep()) {
        break;
      }
    }

    const colaAsLayout: LayoutSimulation = {
      nodes: nodes.map((node, index) => ({
        ...node,
        x: colaNodes[index]!.x,
        y: colaNodes[index]!.y,
      })),
    } as unknown as LayoutSimulation;

    const ourStress = edgeStressOf(layout, edges, IDEAL);
    const colaStress = edgeStressOf(colaAsLayout, edges, IDEAL);
    // eslint-disable-next-line no-console
    console.log(
      `[webcola-oracle] n=${nodes.length} ourStress=${ourStress.toFixed(4)} ` +
        `colaStress=${colaStress.toFixed(4)}`,
    );

    // Comparable quality: within 3x the dense-matrix oracle's stress plus a 0.05
    // floor (the sparse model + halo floors trade a bounded amount of edge fidelity).
    expect(ourStress).toBeLessThan(Math.max(0.25, colaStress * 3 + 0.05));
  });

  it("handles an empty graph and pause/resume", () => {
    const layout = createMajorizationLayout([], [], new FlatGraphBuffer(1));
    expect(layout.isSettled).toBe(true);
    expect(layout.tick(1)).toBe(false);

    const nodes = makeNodes(3);
    const active = layoutOf(nodes, [{ source: "0", target: "1", weight: 1 }]);
    active.pause();
    expect(active.tick(1)).toBe(false);
    active.resume();
    settle(active);
    expect(active.isSettled).toBe(true);
  });
});
