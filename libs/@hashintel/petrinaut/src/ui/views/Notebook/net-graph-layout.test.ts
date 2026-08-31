import { describe, expect, it } from "vitest";

import { edgePath, layoutNetGraph, NET_NODE_HEIGHT } from "./net-graph-layout";

import type { NetGraph, NetGraphNode } from "./notebook-model";

const place = (id: string): NetGraphNode => ({ id, name: id, kind: "place" });
const transition = (id: string): NetGraphNode => ({
  id,
  name: id,
  kind: "transition",
});

const layerOf = (graph: NetGraph, id: string): number => {
  const node = layoutNetGraph(graph).nodes.find((entry) => entry.id === id);
  if (node === undefined) {
    throw new Error(`${id} should be laid out`);
  }
  return node.layer;
};

describe("layoutNetGraph", () => {
  it("returns an empty layout for an empty graph", () => {
    expect(layoutNetGraph({ nodes: [], edges: [] })).toEqual({
      width: 0,
      height: 0,
      nodes: [],
      edges: [],
    });
  });

  it("stacks a chain into one node per layer, in flow order", () => {
    const graph: NetGraph = {
      nodes: [place("Source"), transition("Move"), place("Sink")],
      edges: [
        { from: "Source", to: "Move" },
        { from: "Move", to: "Sink" },
      ],
    };

    expect(layerOf(graph, "Source")).toBe(0);
    expect(layerOf(graph, "Move")).toBe(1);
    expect(layerOf(graph, "Sink")).toBe(2);

    const layout = layoutNetGraph(graph);
    expect(layout.edges.every(({ isBackEdge }) => !isBackEdge)).toBe(true);
    expect(layout.height).toBeGreaterThan(NET_NODE_HEIGHT * 3);
  });

  it("puts a node after its deepest dependency, not its shallowest", () => {
    // Direct  : Source -> Join
    // Indirect: Source -> Detour -> Join
    const graph: NetGraph = {
      nodes: [place("Source"), transition("Detour"), transition("Join")],
      edges: [
        { from: "Source", to: "Join" },
        { from: "Source", to: "Detour" },
        { from: "Detour", to: "Join" },
      ],
    };

    expect(layerOf(graph, "Detour")).toBe(1);
    expect(layerOf(graph, "Join")).toBe(2);
  });

  it("breaks a cycle so every node still gets a layer", () => {
    const graph: NetGraph = {
      nodes: [place("Pool"), transition("Churn")],
      edges: [
        { from: "Pool", to: "Churn" },
        { from: "Churn", to: "Pool" },
      ],
    };

    const layout = layoutNetGraph(graph);

    expect(layout.nodes).toHaveLength(2);
    expect(
      layout.nodes.map(({ layer }) => layer).sort((a, b) => a - b),
    ).toEqual([0, 1]);
    // Exactly one of the two arcs closes the cycle and is drawn as a return.
    expect(layout.edges.filter(({ isBackEdge }) => isBackEdge)).toHaveLength(1);
  });

  it("lays out a graph with no roots at all", () => {
    const graph: NetGraph = {
      nodes: [place("A"), transition("B"), place("C")],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "A" },
      ],
    };

    const layout = layoutNetGraph(graph);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges.filter(({ isBackEdge }) => isBackEdge)).toHaveLength(1);
  });

  it("is deterministic for the same input", () => {
    const graph: NetGraph = {
      nodes: [place("P1"), place("P2"), transition("T"), place("P3")],
      edges: [
        { from: "P1", to: "T" },
        { from: "P2", to: "T" },
        { from: "T", to: "P3" },
      ],
    };

    expect(layoutNetGraph(graph)).toEqual(layoutNetGraph(graph));
  });

  it("keeps disconnected nodes in the graph", () => {
    const graph: NetGraph = {
      nodes: [place("Lonely"), place("Source"), transition("Move")],
      edges: [{ from: "Source", to: "Move" }],
    };

    const layout = layoutNetGraph(graph);

    expect(layout.nodes.map(({ id }) => id).sort()).toEqual([
      "Lonely",
      "Move",
      "Source",
    ]);
    expect(layerOf(graph, "Lonely")).toBe(0);
  });
});

describe("layoutNetGraph with a focus node", () => {
  const chain: NetGraph = {
    nodes: [
      place("Source"),
      transition("Move"),
      place("Middle"),
      transition("Ship"),
      place("Sink"),
      place("Detached"),
    ],
    edges: [
      { from: "Source", to: "Move" },
      { from: "Move", to: "Middle" },
      { from: "Middle", to: "Ship" },
      { from: "Ship", to: "Sink" },
    ],
  };

  const layerFor = (focusId: string, id: string): number => {
    const node = layoutNetGraph(chain, { focusId }).nodes.find(
      (entry) => entry.id === id,
    );
    if (node === undefined) {
      throw new Error(`${id} should be laid out`);
    }
    return node.layer;
  };

  it("stacks dependencies above and dependents below the focus", () => {
    const focus = layerFor("Middle", "Middle");

    expect(layerFor("Middle", "Move")).toBe(focus - 1);
    expect(layerFor("Middle", "Source")).toBe(focus - 2);
    expect(layerFor("Middle", "Ship")).toBe(focus + 1);
    expect(layerFor("Middle", "Sink")).toBe(focus + 2);
  });

  it("keeps unreachable nodes in the layout, below everything else", () => {
    const layout = layoutNetGraph(chain, { focusId: "Middle" });

    expect(layout.nodes).toHaveLength(chain.nodes.length);
    expect(layerFor("Middle", "Detached")).toBeGreaterThan(
      layerFor("Middle", "Sink"),
    );
  });

  it("ignores a focus id that is not in the graph", () => {
    expect(layoutNetGraph(chain, { focusId: "nope" })).toEqual(
      layoutNetGraph(chain),
    );
  });

  it("layers an unreachable component instead of collapsing it to one row", () => {
    const graph: NetGraph = {
      nodes: [
        place("Focus"),
        transition("Feed"),
        // A separate flow the focus can't reach either way.
        place("OtherSource"),
        transition("OtherMove"),
        place("OtherSink"),
      ],
      edges: [
        { from: "Focus", to: "Feed" },
        { from: "OtherSource", to: "OtherMove" },
        { from: "OtherMove", to: "OtherSink" },
      ],
    };
    const layout = layoutNetGraph(graph, { focusId: "Focus" });
    const layer = (id: string) =>
      layout.nodes.find((entry) => entry.id === id)!.layer;

    // The component keeps its own flow order below the reachable band…
    expect(layer("OtherSource")).toBeGreaterThan(layer("Feed"));
    expect(layer("OtherMove")).toBe(layer("OtherSource") + 1);
    expect(layer("OtherSink")).toBe(layer("OtherMove") + 1);
    // …so its edges still travel downwards rather than being classified as
    // degenerate same-row returns.
    for (const edge of layout.edges) {
      expect(edge.isBackEdge).toBe(false);
    }
  });
});

describe("edgePath", () => {
  it("keeps a same-row return edge visible by bowing below the row", () => {
    const path = edgePath({ x: 0, y: 50 }, { x: 200, y: 50 }, true);
    // A flat bow would put every coordinate on y = centre; the dip moves the
    // control points off the row so the curve has visible area.
    const centreY = 50 + NET_NODE_HEIGHT / 2;
    expect(path).toContain(`${centreY + NET_NODE_HEIGHT}`);
  });

  it("does not dip a return edge that spans rows", () => {
    const from = { x: 0, y: 100 };
    const to = { x: 0, y: 0 };
    const path = edgePath(from, to, true);
    const fromCentreY = 100 + NET_NODE_HEIGHT / 2;
    const toCentreY = NET_NODE_HEIGHT / 2;
    expect(path).toContain(`C 104 ${fromCentreY}, 104 ${toCentreY}`);
  });
});
