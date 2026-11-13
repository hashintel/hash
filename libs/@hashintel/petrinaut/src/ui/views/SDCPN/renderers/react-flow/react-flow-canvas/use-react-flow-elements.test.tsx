/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { getOutlineArcPath } from "./shared/outline-arcs";
import { useReactFlowElements } from "./use-react-flow-elements";

import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";
import type { ArcEdgeType, CanvasEdgeType } from "./react-flow-types";

afterEach(cleanup);

const nodeBase = {
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  label: "Node",
  dragging: false,
  selected: false,
  hovered: false,
  focus: "none" as const,
};
const nodes: CanvasNode[] = [
  {
    ...nodeBase,
    id: "place",
    kind: "place",
    portDirection: null,
    dynamicsEnabled: false,
    hasColorType: false,
    hasVisualizer: false,
    visualizerKeptOpen: false,
    visualizerActive: false,
    typeColor: undefined,
  },
  {
    ...nodeBase,
    id: "transition",
    kind: "transition",
    position: { x: 300, y: 200 },
    width: 160,
    height: 80,
    lambdaType: "none",
  },
  {
    ...nodeBase,
    id: "subnet",
    kind: "componentInstance",
    position: { x: 600, y: 0 },
    subnetName: "Subnet",
    binding: { kind: "component" },
    icon: null,
    color: null,
    ports: [
      { id: "port", name: "Port", direction: "inout", typeColor: undefined },
    ],
    foldable: false,
    unfolded: true,
    anchorOffset: 0,
  },
];
const arcBase: Omit<CanvasArc, "id" | "sourceId" | "targetId"> = {
  kind: "read",
  weight: 3,
  sourcePortId: null,
  targetPortId: null,
  transitionId: "transition",
  color: "#123456",
  selected: true,
  focus: "none",
};
const scene: CanvasScene = {
  nodes,
  fusions: [],
  dimensions: compactNodeDimensions,
  focusActive: false,
  arcs: [
    { ...arcBase, id: "input", sourceId: "place", targetId: "transition" },
    {
      ...arcBase,
      id: "output",
      sourceId: "transition",
      targetId: "place",
      kind: "standard",
    },
    {
      ...arcBase,
      id: "port-input",
      sourceId: "subnet",
      targetId: "transition",
      sourcePortId: "port",
    },
    {
      ...arcBase,
      id: "port-output",
      sourceId: "transition",
      targetId: "subnet",
      targetPortId: "port",
    },
  ],
};

/** The arcs among the hook's edges, which also carry the fusion links. */
const arcEdges = (edges: CanvasEdgeType[]): ArcEdgeType[] =>
  edges.filter((edge): edge is ArcEdgeType => edge.type === "default");

describe("arc rendering", () => {
  it.each([false, true])(
    "attaches diagonal arcs to square transition corners with compact nodes %s",
    (compactNodes) => {
      const dimensions = compactNodes
        ? compactNodeDimensions
        : classicNodeDimensions;
      const transitionSize = dimensions.transition;
      const transitionPosition = {
        x: transitionSize.width * 3,
        y: transitionSize.height * 3,
      };
      const { result } = renderHook(() =>
        useReactFlowElements({
          ...scene,
          dimensions,
          nodes: nodes.map((node) =>
            node.kind === "transition"
              ? { ...node, ...transitionSize, position: transitionPosition }
              : node,
          ),
          arcs: [
            {
              ...arcBase,
              id: "input",
              sourceId: "place",
              targetId: "transition",
            },
          ],
        }),
      );

      const data = arcEdges(result.current.edges).find(
        (edge) => edge.id === "input",
      )?.data;
      if (!data?.sourceOutline || !data.targetOutline) {
        throw new Error("an arc between nodes should carry both outlines");
      }
      const [path] = getOutlineArcPath(data.sourceOutline, data.targetOutline);
      const endpoint = path.split(" ").at(-1)?.split(",").map(Number);
      expect(endpoint?.[0]).toBeCloseTo(
        transitionPosition.x - transitionSize.width / 2,
      );
      expect(endpoint?.[1]).toBeCloseTo(
        transitionPosition.y - transitionSize.height / 2,
      );
    },
  );

  it("attaches arcs to node outlines and subnet port arcs to the port's handle", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));
    const edges = new Map(
      arcEdges(result.current.edges).map((edge) => [edge.id, edge]),
    );

    for (const id of ["input", "output"]) {
      expect(edges.get(id)?.data?.sourceOutline).not.toBeNull();
      expect(edges.get(id)?.data?.targetOutline).not.toBeNull();
      expect(edges.get(id)?.data?.hasReverseArc).toBe(true);
    }

    const fromPort = edges.get("port-input");
    expect(fromPort?.sourceHandle).toBe("port-out-port");
    expect(fromPort?.data?.sourceOutline).toBeNull();
    expect(fromPort?.data?.targetOutline).not.toBeNull();

    const intoPort = edges.get("port-output");
    expect(intoPort?.targetHandle).toBe("port-in-port");
    expect(intoPort?.data?.sourceOutline).not.toBeNull();
    expect(intoPort?.data?.targetOutline).toBeNull();

    // Into and out of the same component: separate curves at the transition.
    expect(fromPort?.data?.hasReverseArc).toBe(true);
    expect(intoPort?.data?.hasReverseArc).toBe(true);
  });

  it("recomputes attachments during node movement without mutating the scene", () => {
    const snapshot = structuredClone(scene);
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const previous = arcEdges(result.current.edges).find(
      (edge) => edge.id === "input",
    )?.data?.targetOutline;
    rerender({
      ...scene,
      nodes: nodes.map((node) =>
        node.id === "transition"
          ? { ...node, position: { x: -200, y: 100 }, dragging: true }
          : node,
      ),
    });
    expect(
      arcEdges(result.current.edges).find((edge) => edge.id === "input")?.data
        ?.targetOutline,
    ).not.toEqual(previous);
    expect(scene).toEqual(snapshot);
  });

  it("preserves unaffected nodes and arcs when focus changes", () => {
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const previous = result.current;
    rerender({
      ...scene,
      focusActive: true,
      nodes: nodes.map((node) =>
        node.id === "place"
          ? { ...node, focus: "focused", hovered: true }
          : { ...node },
      ),
      arcs: scene.arcs.map((arc) =>
        arc.id === "input" ? { ...arc, focus: "outgoing" } : { ...arc },
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
    for (const edge of arcEdges(result.current.edges)) {
      const original = arcEdges(previous.edges).find(
        (candidate) => candidate.id === edge.id,
      );
      if (edge.id === "input") {
        expect(edge).not.toBe(original);
        expect(edge.data?.focus).toBe("outgoing");
        expect(edge.data?.targetOutline).toEqual(original?.data?.targetOutline);
        expect(edge.markerEnd).not.toEqual(original?.markerEnd);
      } else {
        expect(edge).toBe(original);
      }
    }
  });
});

describe("node placement", () => {
  it("hangs a component instance from its top edge, other nodes from their centre", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));
    const byId = new Map(result.current.nodes.map((node) => [node.id, node]));

    // Centred at (600, 0) and 100 high in the scene.
    expect(byId.get("subnet")?.origin).toEqual([0.5, 0]);
    expect(byId.get("subnet")?.position).toEqual({ x: 600, y: -50 });

    expect(byId.get("place")?.origin).toBeUndefined();
    expect(byId.get("place")?.position).toEqual({ x: 0, y: 0 });
  });
});
