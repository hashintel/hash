/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { arcLayerEdgeId } from "./arc-layer-context";
import { nodes, scene, withArcs } from "./scene.test-helpers";
import { useReactFlowElements } from "./use-react-flow-elements";

import type { CanvasScene } from "../../../canvas-scene";

afterEach(cleanup);

const linkBase = {
  fusionId: "belt",
  name: "Belt",
  sourceId: "place",
  targetId: "component",
  sourcePortId: null,
  targetPortId: "port",
  selected: false,
  severity: null,
  focus: "none" as const,
};

describe("fusion links", () => {
  it("offers the ends the scene says can move", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        fusions: [
          { ...linkBase, id: "two", movableEnds: "both" },
          { ...linkBase, id: "three", movableEnds: "target" },
        ],
      }),
    );

    expect(
      result.current.edges
        .filter((edge) => edge.type === "fusion")
        .map(({ id, reconnectable, targetHandle }) => [
          id,
          reconnectable,
          targetHandle,
        ]),
    ).toEqual([
      ["two", true, "port-in-port"],
      ["three", "target", "port-in-port"],
    ]);
  });
});

describe("the edge that draws the arcs", () => {
  it("is one edge for all the arcs, before the fusion links", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        fusions: [{ ...linkBase, id: "link", movableEnds: "both" }],
      }),
    );

    expect(result.current.edges.map((edge) => edge.id)).toEqual([
      arcLayerEdgeId,
      "link",
    ]);
  });

  it("runs from a transition to itself, which React Flow can always place", () => {
    // The first arc ends at a component, which may have no pin to measure.
    const { result } = renderHook(() =>
      useReactFlowElements({
        ...scene,
        arcs: [...scene.arcs].reverse(),
      }),
    );
    const [layer] = result.current.edges;

    expect(layer?.source).toBe("transition");
    expect(layer?.target).toBe("transition");
    expect(layer?.sourceHandle).toBeUndefined();
    expect(layer?.targetHandle).toBeUndefined();
  });

  it("takes no focus and no selection, and says nothing to a screen reader", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));

    expect(result.current.edges[0]).toMatchObject({
      type: "arcs",
      focusable: false,
      selectable: false,
      ariaRole: "none",
      ariaLabel: null,
      domAttributes: { "aria-roledescription": undefined },
    });
  });

  it("is absent from a net without arcs", () => {
    const { result } = renderHook(() =>
      useReactFlowElements({ ...scene, arcs: [] }),
    );
    expect(result.current.edges).toEqual([]);
  });

  it("stays the same object while the arcs change", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const [layer] = result.current.edges;

    rerender(withArcs({ input: { focus: "outgoing" } }));
    expect(result.current.edges[0]).toBe(layer);
  });
});

describe("selected arcs", () => {
  it("are edges React Flow holds and does not draw, so that it can deselect them", () => {
    const { result } = renderHook(() =>
      useReactFlowElements(
        withArcs({
          output: { selected: true },
          "port-input": { selected: true },
        }),
      ),
    );

    expect(result.current.edges.slice(1)).toEqual([
      {
        id: "output",
        source: "transition",
        target: "place",
        sourceHandle: undefined,
        targetHandle: undefined,
        hidden: true,
        selected: true,
      },
      {
        id: "port-input",
        source: "component",
        target: "transition",
        sourceHandle: "port-out-port",
        targetHandle: undefined,
        hidden: true,
        selected: true,
      },
    ]);
  });
});

describe("nodes", () => {
  it("preserves unaffected nodes when focus changes", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const previous = result.current;
    rerender({
      ...scene,
      focusActive: true,
      nodes: nodes.map((node) =>
        node.id === "place" ? { ...node, focus: "focused" } : { ...node },
      ),
    });

    for (const node of result.current.nodes) {
      const original = previous.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (node.id === "place") {
        expect(node).not.toBe(original);
        expect(node.data.focus).toBe("focused");
      } else {
        expect(node).toBe(original);
      }
    }
  });

  it("hangs a component instance from its top edge, other nodes from their centre", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));
    const byId = new Map(result.current.nodes.map((node) => [node.id, node]));

    // Centred at (600, 0) and 100 high in the scene.
    expect(byId.get("component")?.origin).toEqual([0.5, 0]);
    expect(byId.get("component")?.position).toEqual({ x: 600, y: -50 });

    expect(byId.get("place")?.origin).toBeUndefined();
    expect(byId.get("place")?.position).toEqual({ x: 0, y: 0 });
  });
});
