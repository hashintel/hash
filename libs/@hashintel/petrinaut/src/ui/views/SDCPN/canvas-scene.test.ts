import { describe, expect, it } from "vitest";

import {
  compactNodeDimensions,
  DEFAULT_PETRINAUT_EXTENSIONS,
  generateArcId,
  getArcEndpointKey,
} from "@hashintel/petrinaut-core";

import { buildCanvasScene, type CanvasSceneInput } from "./canvas-scene";

import type { Place, SDCPN, Transition } from "@hashintel/petrinaut-core";

const place = (id: string, x: number, y: number): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x,
  y,
});

const transitionX = 300;
const transitionY = 40;

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): Transition => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({ placeId, weight: 2, type: "read" })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: transitionX,
  y: transitionY,
});

const sdcpn: SDCPN = {
  places: [place("p1", 0, 0), place("p2", 600, 0)],
  transitions: [transition("t1", ["p1"], ["p2"])],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
};

const placeKey = (placeId: string) =>
  getArcEndpointKey({ kind: "place", placeId });
const inputArcId = generateArcId({ inputId: placeKey("p1"), outputId: "t1" });
const outputArcId = generateArcId({ inputId: "t1", outputId: placeKey("p2") });

const input: CanvasSceneInput = {
  net: { ...sdcpn, componentInstances: [] },
  sdcpn,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  dimensions: compactNodeDimensions,
  draggingStateByNodeId: {},
  isSelected: () => false,
  isHovered: () => false,
  isDimmed: () => false,
};

describe("buildCanvasScene", () => {
  it("sizes nodes by kind and centres them on their stored position", () => {
    const { nodes } = buildCanvasScene(input);
    const p1 = nodes.find((node) => node.id === "p1")!;
    const t1 = nodes.find((node) => node.id === "t1")!;

    expect(p1).toMatchObject({
      kind: "place",
      position: { x: 0, y: 0 },
      ...compactNodeDimensions.place,
      dragging: false,
    });
    expect(t1).toMatchObject({
      kind: "transition",
      position: { x: transitionX, y: transitionY },
      ...compactNodeDimensions.transition,
    });
  });

  it("follows the drag preview while a node is dragged", () => {
    const { nodes } = buildCanvasScene({
      ...input,
      draggingStateByNodeId: {
        p1: { dragging: true, position: { x: 50, y: 60 } },
      },
    });
    expect(nodes.find((node) => node.id === "p1")).toMatchObject({
      position: { x: 50, y: 60 },
      dragging: true,
    });
  });

  it("carries selection, hover and dimming per item", () => {
    const { nodes, arcs } = buildCanvasScene({
      ...input,
      isSelected: (id) => id === "p1",
      isHovered: (id) => id === "t1",
      isDimmed: (id) => id === "p2" || id === outputArcId,
    });
    expect(nodes.find((node) => node.id === "p1")?.selected).toBe(true);
    expect(nodes.find((node) => node.id === "t1")?.hovered).toBe(true);
    expect(nodes.find((node) => node.id === "p2")?.dimmed).toBe(true);
    expect(arcs.find((arc) => arc.id === outputArcId)?.dimmed).toBe(true);
    expect(arcs.find((arc) => arc.id === inputArcId)?.dimmed).toBe(false);
  });

  it("builds one arc per input and output arc, oriented through the transition", () => {
    const { arcs } = buildCanvasScene(input);
    expect(arcs).toHaveLength(2);

    const inputArc = arcs.find((arc) => arc.targetId === "t1")!;
    expect(inputArc).toMatchObject({
      id: inputArcId,
      sourceId: "p1",
      transitionId: "t1",
      kind: "read",
      weight: 2,
      sourcePortId: null,
      targetPortId: null,
    });

    const outputArc = arcs.find((arc) => arc.sourceId === "t1")!;
    expect(outputArc).toMatchObject({
      id: outputArcId,
      targetId: "p2",
      kind: "standard",
      weight: 1,
    });
  });
});
