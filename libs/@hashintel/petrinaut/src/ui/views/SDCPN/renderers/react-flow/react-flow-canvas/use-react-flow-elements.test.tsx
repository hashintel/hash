/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { useReactFlowElements } from "./use-react-flow-elements";

import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";

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
    ports: [{ id: "port", name: "Port" }],
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

      const path = result.current.edges.find((edge) => edge.id === "input")
        ?.data?.outlinePath?.[0];
      expect(path).toBeDefined();
      const endpoint = path?.split(" ").at(-1)?.split(",").map(Number);
      expect(endpoint?.[0]).toBeCloseTo(
        transitionPosition.x - transitionSize.width / 2,
      );
      expect(endpoint?.[1]).toBeCloseTo(
        transitionPosition.y - transitionSize.height / 2,
      );
    },
  );

  it("draws arcs between nodes along their outlines and leaves subnet port arcs to their handles", () => {
    const { result } = renderHook(() => useReactFlowElements(scene));
    const edges = new Map(result.current.edges.map((edge) => [edge.id, edge]));

    expect(edges.get("input")?.data?.outlinePath).toBeDefined();
    expect(edges.get("output")?.data?.outlinePath).toBeDefined();

    const fromPort = edges.get("port-input");
    expect(fromPort?.sourceHandle).toBe("port-out-port");
    expect(fromPort?.data?.outlinePath).toBeUndefined();

    const intoPort = edges.get("port-output");
    expect(intoPort?.targetHandle).toBe("port-in-port");
    expect(intoPort?.data?.outlinePath).toBeUndefined();
  });

  it("recomputes attachments during node movement without mutating the scene", () => {
    const snapshot = structuredClone(scene);
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene },
    );
    const previous = result.current.edges.find((edge) => edge.id === "input")
      ?.data?.outlinePath;
    rerender({
      ...scene,
      nodes: nodes.map((node) =>
        node.id === "transition"
          ? { ...node, position: { x: -200, y: 100 }, dragging: true }
          : node,
      ),
    });
    expect(
      result.current.edges.find((edge) => edge.id === "input")?.data
        ?.outlinePath,
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
    for (const edge of result.current.edges) {
      const original = previous.edges.find(
        (candidate) => candidate.id === edge.id,
      );
      if (edge.id === "input") {
        expect(edge).not.toBe(original);
        expect(edge.data?.focus).toBe("outgoing");
        expect(edge.data?.outlinePath).toEqual(original?.data?.outlinePath);
        expect(edge.markerEnd).not.toEqual(original?.markerEnd);
      } else {
        expect(edge).toBe(original);
      }
    }
  });
});
