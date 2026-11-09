import { describe, expect, it } from "vitest";

import {
  compactNodeDimensions,
  DEFAULT_PETRINAUT_EXTENSIONS,
  generateArcId,
  getArcEndpointKey,
} from "@hashintel/petrinaut-core";

import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import { buildCanvasScene, type CanvasSceneInput } from "./canvas-scene";

import type {
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "@hashintel/petrinaut-core";

const place = (id: string, x: number, y: number): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
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
  net: { ...sdcpn, componentInstances: [], fusions: [] },
  sdcpn,
  fusionStatuses: new Map(),
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  dimensions: compactNodeDimensions,
  draggingStateByNodeId: {},
  isSelected: () => false,
  hoveredId: null,
  focus: resolveCanvasFocus({
    adjacency: buildNetAdjacency({
      ...sdcpn,
      componentInstances: [],
      fusions: [],
    }),
    hoveredId: null,
    selectedIds: new Set(),
  }),
  keptOpenVisualizerIds: new Set(),
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

  it("carries selection, hover and focus roles per item", () => {
    const { nodes, arcs } = buildCanvasScene({
      ...input,
      isSelected: (id) => id === "p1",
      hoveredId: "t1",
      focus: resolveCanvasFocus({
        adjacency: buildNetAdjacency(input.net),
        hoveredId: "t1",
        selectedIds: new Set(["p1"]),
      }),
    });
    expect(nodes.find((node) => node.id === "p1")?.selected).toBe(true);
    expect(nodes.find((node) => node.id === "t1")?.hovered).toBe(true);
    expect(nodes.find((node) => node.id === "t1")?.focus).toBe("focused");
    expect(nodes.find((node) => node.id === "p2")?.focus).toBe("downstream");
    expect(arcs.find((arc) => arc.id === inputArcId)?.focus).toBe("incoming");
    expect(arcs.find((arc) => arc.id === outputArcId)?.focus).toBe("outgoing");
  });

  it("marks the hovered node even where nothing is focused", () => {
    // The hover highlight can be turned off, which leaves the focus empty
    // while the pointer still rests on a node — the state visualizer and the
    // rest of the hover-driven surfaces still have to see it.
    const { nodes } = buildCanvasScene({ ...input, hoveredId: "p1" });

    expect(nodes.find((node) => node.id === "p1")?.hovered).toBe(true);
    expect(nodes.find((node) => node.id === "p1")?.focus).toBe("none");
  });

  it("marks a place whose state visualizer is kept open", () => {
    const { nodes } = buildCanvasScene({
      ...input,
      keptOpenVisualizerIds: new Set(["p1"]),
    });

    expect(nodes.find((node) => node.id === "p1")).toMatchObject({
      visualizerKeptOpen: true,
    });
    expect(nodes.find((node) => node.id === "p2")).toMatchObject({
      visualizerKeptOpen: false,
    });
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

  it("runs a fusion link between the sides of its ends that face each other", () => {
    const stage = {
      id: "stage",
      name: "Stage",
      places: [{ ...place("in", 0, 0), isPort: true }],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const instance = (id: string, x: number) => ({
      id,
      name: id,
      subnetId: "stage",
      parameterValues: {},
      x,
      y: 0,
    });
    const fusionWith = (instanceId: string) => ({
      id: `fusion-${instanceId}`,
      members: [
        { kind: "place" as const, placeId: "p1" },
        {
          kind: "componentPort" as const,
          componentInstanceId: instanceId,
          portPlaceId: "in",
        },
      ],
    });
    const composed: SDCPN = {
      ...sdcpn,
      subnets: [stage],
      componentInstances: [instance("left", -400), instance("right", 900)],
      fusions: [fusionWith("left"), fusionWith("right")],
    };

    const composedNet = {
      ...composed,
      componentInstances: composed.componentInstances ?? [],
      fusions: composed.fusions ?? [],
    };
    const build = (overrides: Partial<CanvasSceneInput> = {}) =>
      buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: composedNet,
        fusionStatuses: new Map([
          ["fusion-left", { name: "Belt", severity: "warning" }],
        ]),
        ...overrides,
      });
    const { fusions } = build();

    expect(fusions).toHaveLength(2);
    // A link wears its fusion's name and worst problem; without a status it
    // falls back to the fusion's id and no problem.
    expect(fusions.map(({ name, severity }) => [name, severity])).toEqual([
      ["Belt", "warning"],
      ["fusion-right", null],
    ]);
    // An instance dragged across the hub swaps the ends of its link.
    expect(
      build({
        draggingStateByNodeId: {
          right: { dragging: true, position: { x: -900, y: 0 } },
        },
      }).fusions.find((link) => link.fusionId === "fusion-right"),
    ).toMatchObject({ sourceId: "right", targetId: "p1" });
    expect(
      fusions.find((link) => link.fusionId === "fusion-left"),
    ).toMatchObject({
      sourceId: "left",
      sourcePortId: "in",
      targetId: "p1",
      targetPortId: null,
    });
    expect(
      fusions.find((link) => link.fusionId === "fusion-right"),
    ).toMatchObject({
      sourceId: "p1",
      sourcePortId: null,
      targetId: "right",
      targetPortId: "in",
    });
  });

  describe("components and ports", () => {
    const token = {
      id: "tok",
      name: "Tok",
      iconSlug: "circle",
      displayColor: "#ff0000",
      elements: [{ elementId: "v", name: "v", type: "real" as const }],
    };
    const iface: Subnet = {
      id: "iface",
      name: "Stage",
      interface: true,
      places: [
        {
          ...place("in", 0, 0),
          isPort: true,
          portDirection: "in",
          colorId: "tok",
        },
      ],
      transitions: [],
      types: [token],
      differentialEquations: [],
      parameters: [],
    };
    const fast: Subnet = {
      ...iface,
      id: "fast",
      name: "Fast",
      interface: undefined,
      implements: ["iface"],
    };
    const instance = (
      id: string,
      subnetId: string,
      implementation?: string,
    ) => ({
      id,
      name: id,
      subnetId,
      parameterValues: {},
      x: 0,
      y: 0,
      ...(implementation === undefined ? {} : { implementation }),
    });
    const composed: SDCPN = {
      ...sdcpn,
      subnets: [iface, fast],
      implementations: { iface: "fast" },
      componentInstances: [
        instance("bound", "iface"),
        instance("plain", "fast"),
        instance("loose", "iface", "ghost"),
      ],
    };

    it("tells an instance's binding from the subnet it points at", () => {
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: {
          ...composed,
          componentInstances: composed.componentInstances ?? [],
          fusions: [],
        },
      });
      const binding = (id: string) =>
        nodes.find(
          (node) => node.id === id && node.kind === "componentInstance",
        );

      expect(binding("bound")).toMatchObject({
        subnetName: "Stage",
        binding: { kind: "interface", implementationName: "Fast" },
        ports: [
          { id: "in", name: "in", direction: "in", typeColor: "#ff0000" },
        ],
      });
      expect(binding("plain")).toMatchObject({
        binding: { kind: "component" },
      });
      expect(binding("loose")).toMatchObject({
        binding: { kind: "interface", implementationName: null },
      });
      expect(nodes.find((node) => node.id === "p1")).toMatchObject({
        port: null,
      });
    });

    it("flags a port place inside a subnet with its direction", () => {
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: { ...iface, componentInstances: [], fusions: [] },
      });

      expect(nodes.find((node) => node.id === "in")).toMatchObject({
        kind: "place",
        port: "in",
        typeColor: "#ff0000",
      });
    });
  });
});
