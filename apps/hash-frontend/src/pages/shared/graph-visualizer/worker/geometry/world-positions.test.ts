import { describe, expect, it } from "vitest";

import { ClusterId } from "../../ids";
import { ClusterNode } from "../hierarchy/cluster-tree";
import { syncWorldPositions } from "./world-positions";

import type { ForceNode, LayoutSimulation } from "../layout/force-simulation";

/**
 * A minimal settled LayoutSimulation whose node local offsets we control, so we
 * test the world composition without any solver noise.
 */
function fakeLayout(localOffsets: { id: string; x: number; y: number }[]): {
  layout: LayoutSimulation;
  nodes: ForceNode[];
} {
  const nodes: ForceNode[] = localOffsets.map((offset) => ({
    id: offset.id,
    radius: 1,
    x: offset.x,
    y: offset.y,
  }));
  const layout: LayoutSimulation = {
    status: "settled",
    isSettled: true,
    nodes,
    buffer: new ArrayBuffer(0),
    nodeIds: nodes.map((node) => node.id),
    alpha: 0,
    tick: () => false,
    pause: () => {},
    resume: () => {},
  };
  return { layout, nodes };
}

function makeNode(id: string): ClusterNode {
  const node = new ClusterNode(ClusterId(id), "community", {
    source: "groups",
    keys: [],
  });
  node.circle.radius = 10;
  return node;
}

describe("syncWorldPositions, nested world composition", () => {
  it("composes leaf world = root + container-local + leaf-local at depth 2", () => {
    const root = makeNode("cluster:root");
    const container = makeNode("A"); // top-level container
    const leaf = makeNode("A:leaf"); // depth-2 leaf inside the container
    root.addChild(container);
    container.addChild(leaf);

    // The root's layout (keyed by the root) places the container at local
    // (100, 0); the container's layout (keyed by the container) places the leaf
    // at local (5, 3). A layout is keyed by the PARENT whose children it lays.
    const rootLayout = fakeLayout([{ id: "A", x: 100, y: 0 }]);
    const containerLayout = fakeLayout([{ id: "A:leaf", x: 5, y: 3 }]);
    const layouts = new Map<string, LayoutSimulation>([
      ["cluster:root", rootLayout.layout],
      ["A", containerLayout.layout],
    ]);
    const isCluster = (id: ClusterId): boolean => layouts.has(id);
    const layoutFor = (id: ClusterId): LayoutSimulation | undefined =>
      layouts.get(id);

    syncWorldPositions(root, layoutFor, isCluster);

    expect(container.circle.x).toBe(100);
    expect(leaf.circle.x).toBe(105); // 0 (root) + 100 (A) + 5 (leaf)
    expect(leaf.circle.y).toBe(3);
  });

  it("carries a deep leaf when the macro moves the container, through a settled intermediate", () => {
    const root = makeNode("cluster:root");
    const container = makeNode("A");
    const leaf = makeNode("A:leaf");
    root.addChild(container);
    container.addChild(leaf);

    const rootLayout = fakeLayout([{ id: "A", x: 100, y: 0 }]);
    const containerLayout = fakeLayout([{ id: "A:leaf", x: 5, y: 3 }]);
    const layouts = new Map<string, LayoutSimulation>([
      ["cluster:root", rootLayout.layout],
      ["A", containerLayout.layout],
    ]);
    const isCluster = (id: ClusterId): boolean => layouts.has(id);
    const layoutFor = (id: ClusterId): LayoutSimulation | undefined =>
      layouts.get(id);

    syncWorldPositions(root, layoutFor, isCluster);
    expect(leaf.circle.x).toBe(105);

    // The macro re-settles and moves the container by +50 in x. Only the ROOT
    // layout changes; the container's own (settled) layout is untouched.
    rootLayout.nodes[0]!.x = 150;

    syncWorldPositions(root, layoutFor, isCluster);

    // The deep leaf must follow the container, NOT stay at its old world x.
    expect(container.circle.x).toBe(150);
    expect(leaf.circle.x).toBe(155); // followed: 150 + 5
    expect(leaf.circle.y).toBe(3);
  });
});
