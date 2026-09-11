/** @vitest-environment jsdom */
import { cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { compactNodeDimensions } from "@hashintel/petrinaut-core";

import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../../../../../react/state/user-settings-context";
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
    visualizerPinned: false,
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

const Settings = ({ children }: { children: ReactNode }) => {
  const [enabled, setEnabled] = useState(false);
  return (
    <UserSettingsContext
      value={{
        ...defaultUserSettingsContextValue,
        enableAutomaticArcConnections: enabled,
      }}
    >
      <button type="button" onClick={() => setEnabled(!enabled)}>
        Toggle automatic arcs
      </button>
      {children}
    </UserSettingsContext>
  );
};

describe("automatic arc rendering", () => {
  it("changes only ordinary arc geometry and restores all legacy edge data when switched off", () => {
    const { result } = renderHook(() => useReactFlowElements(scene), {
      wrapper: Settings,
    });
    const legacy = result.current.edges;
    expect(legacy.every((edge) => edge.data?.outlinePath === undefined)).toBe(
      true,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle automatic arcs" }),
    );
    for (const edge of result.current.edges) {
      const original = legacy.find((candidate) => candidate.id === edge.id);
      if (edge.id.startsWith("port-")) {
        expect(edge).toEqual(original);
      } else {
        expect(edge.data?.outlinePath).toBeDefined();
        expect({
          ...edge,
          data: { ...edge.data, outlinePath: undefined },
        }).toEqual(original);
      }
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle automatic arcs" }),
    );
    expect(result.current.edges).toEqual(legacy);
  });

  it("recomputes attachments during node movement without mutating the scene", () => {
    const snapshot = structuredClone(scene);
    const { result, rerender } = renderHook(
      (input: CanvasScene) => useReactFlowElements(input),
      { initialProps: scene, wrapper: Settings },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle automatic arcs" }),
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
      { initialProps: scene, wrapper: Settings },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle automatic arcs" }),
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
