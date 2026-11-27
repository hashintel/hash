/**
 * A small scene for the tests of the React Flow renderer: a place, a
 * transition and a component instance, joined by an arc each way between the
 * place and the transition and an arc each way between the transition and a
 * port of the instance.
 */

import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";

const nodeBase = {
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  label: "Node",
  dragging: false,
  selected: false,
  focus: "none" as const,
};

export const nodes: CanvasNode[] = [
  {
    ...nodeBase,
    id: "place",
    kind: "place",
    portDirection: null,
    dynamicsEnabled: false,
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
    id: "component",
    kind: "componentInstance",
    position: { x: 600, y: 0 },
    componentName: "Component",
    binding: { kind: "component" },
    icon: null,
    color: null,
    ports: [
      { id: "port", name: "Port", direction: "inout", typeColor: undefined },
    ],
    foldable: false,
    unfolded: true,
    anchorOffset: 0,
    visualizerHeight: 0,
  },
];

export const arcBase: Omit<CanvasArc, "id" | "sourceId" | "targetId"> = {
  kind: "standard",
  weight: 1,
  sourcePortId: null,
  targetPortId: null,
  transitionId: "transition",
  color: "#123456",
  selected: false,
  focus: "none",
};

export const scene: CanvasScene = {
  nodes,
  fusions: [],
  focusActive: false,
  arcs: [
    { ...arcBase, id: "input", sourceId: "place", targetId: "transition" },
    { ...arcBase, id: "output", sourceId: "transition", targetId: "place" },
    {
      ...arcBase,
      id: "port-input",
      sourceId: "component",
      targetId: "transition",
      sourcePortId: "port",
    },
    {
      ...arcBase,
      id: "port-output",
      sourceId: "transition",
      targetId: "component",
      targetPortId: "port",
    },
  ],
};

/** The scene with some of its arcs changed, by id. */
export const withArcs = (
  changes: Record<string, Partial<CanvasArc>>,
  base: CanvasScene = scene,
): CanvasScene => ({
  ...base,
  arcs: base.arcs.map((arc) => ({ ...arc, ...changes[arc.id] })),
});

/** The scene with one of its nodes at another position. */
export const withNodeAt = (
  nodeId: string,
  position: { x: number; y: number },
  base: CanvasScene = scene,
): CanvasScene => ({
  ...base,
  nodes: base.nodes.map((node) =>
    node.id === nodeId ? { ...node, position, dragging: true } : { ...node },
  ),
});
