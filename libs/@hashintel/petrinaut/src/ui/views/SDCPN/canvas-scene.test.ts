import { describe, expect, it } from "vitest";

import {
  compactNodeDimensions,
  DEFAULT_PETRINAUT_EXTENSIONS,
  generateArcId,
  getArcEndpointKey,
  getComponentInstanceHeight,
  resolveLibrary,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import { logisticsLibrary } from "../../stories/libraries-story-fixtures";
import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import {
  buildCanvasScene,
  transitionLambdaTypes,
  type CanvasSceneInput,
} from "./canvas-scene";
import { countReads } from "./count-reads.test-helpers";
import { arcStrokeColor } from "./styles/type-colors";

import type {
  Component,
  Place,
  SDCPN,
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
  libraries: new Map(),
  fusionSeverities: new Map(),
  lambdaTypes: new Map(),
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  dimensions: compactNodeDimensions,
  dragPreview: new Map(),
  selectedIds: new Set(),
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
  unfoldedInstanceIds: new Set(),
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

  it("labels a transition with how the net's index says it gives its rate", () => {
    const lambdaTypes = transitionLambdaTypes(
      input.net,
      sdcpn,
      DEFAULT_PETRINAUT_EXTENSIONS,
      new Map(),
    );
    const { nodes } = buildCanvasScene({ ...input, lambdaTypes });

    expect([...lambdaTypes]).toEqual([["t1", "predicate"]]);
    expect(nodes.find((node) => node.id === "t1")).toMatchObject({
      lambdaType: "predicate",
    });
  });

  it("follows the drag preview while a node is dragged", () => {
    const { nodes } = buildCanvasScene({
      ...input,
      dragPreview: new Map([["p1", { x: 50, y: 60 }]]),
    });
    expect(nodes.find((node) => node.id === "p1")).toMatchObject({
      position: { x: 50, y: 60 },
      dragging: true,
    });
  });

  it("carries selection and focus roles per item", () => {
    const { nodes, arcs } = buildCanvasScene({
      ...input,
      selectedIds: new Set(["p1"]),
      focus: resolveCanvasFocus({
        adjacency: buildNetAdjacency(input.net),
        hoveredId: "t1",
        selectedIds: new Set(["p1"]),
      }),
    });
    expect(nodes.find((node) => node.id === "p1")?.selected).toBe(true);
    expect(nodes.find((node) => node.id === "t1")?.focus).toBe("focused");
    expect(nodes.find((node) => node.id === "p2")?.focus).toBe("downstream");
    expect(arcs.find((arc) => arc.id === inputArcId)?.focus).toBe("incoming");
    expect(arcs.find((arc) => arc.id === outputArcId)?.focus).toBe("outgoing");
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
      component: { id: "stage" },
      parameterValues: {},
      x,
      y: 0,
    });
    const fusionWith = (instanceId: string) => ({
      id: `fusion-${instanceId}`,
      name: `Belt ${instanceId}`,
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
      components: [stage],
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
        fusionSeverities: new Map([["fusion-left", "warning"]]),
        ...overrides,
      });
    const { fusions } = build();

    expect(fusions).toHaveLength(2);
    // A link wears its fusion's name and worst problem, and no problem
    // without a status.
    expect(fusions.map(({ name, severity }) => [name, severity])).toEqual([
      ["Belt left", "warning"],
      ["Belt right", null],
    ]);
    // An instance dragged across the hub swaps the ends of its link.
    expect(
      build({
        dragPreview: new Map([["right", { x: -900, y: 0 }]]),
      }).fusions.find((link) => link.fusionId === "fusion-right"),
    ).toMatchObject({ sourceId: "right", targetId: "p1" });
    expect(
      fusions.find((link) => link.fusionId === "fusion-left"),
    ).toMatchObject({
      sourceId: "left",
      sourcePortId: "in",
      targetId: "p1",
      targetPortId: null,
      // A fusion of two can be picked up by either end.
      movableEnds: "both",
    });
    // Where three meet, a link moves by its member's end and the hub stays.
    const three = {
      id: "three",
      name: "Three",
      members: [...fusionWith("left").members, fusionWith("right").members[1]!],
    };
    expect(
      build({ net: { ...composedNet, fusions: [three] } }).fusions.map(
        ({ sourceId, targetId, movableEnds }) => [
          sourceId,
          targetId,
          movableEnds,
        ],
      ),
    ).toEqual([
      ["left", "p1", "source"],
      ["p1", "right", "target"],
    ]);
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
    const iface: Component = {
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
    const fast: Component = {
      ...iface,
      id: "fast",
      name: "Fast",
      interface: undefined,
      implements: ["iface"],
    };
    const instance = (
      id: string,
      componentId: string,
      implementation?: string,
    ) => ({
      id,
      name: id,
      component: { id: componentId },
      parameterValues: {},
      x: 0,
      y: 0,
      ...(implementation === undefined
        ? {}
        : { implementation: { id: implementation } }),
    });
    const composed: SDCPN = {
      ...sdcpn,
      components: [iface, fast],
      implementations: [
        { interface: { id: "iface" }, component: { id: "fast" } },
      ],
      componentInstances: [
        instance("bound", "iface"),
        instance("plain", "fast"),
        instance("loose", "iface", "ghost"),
      ],
    };
    /** A document's root as the net the canvas shows, with nothing fused. */
    const activeNet = (document: SDCPN) => ({
      ...document,
      componentInstances: document.componentInstances ?? [],
      fusions: [],
    });

    it("tells an instance's binding from the component it points at", () => {
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: activeNet(composed),
      });
      const instanceNode = (id: string) =>
        nodes.find(
          (node) => node.id === id && node.kind === "componentInstance",
        );

      expect(instanceNode("bound")).toMatchObject({
        componentName: "Stage",
        binding: { kind: "interface", implementationName: "Fast" },
        ports: [
          { id: "in", name: "in", direction: "in", typeColor: "#ff0000" },
        ],
      });
      expect(instanceNode("plain")).toMatchObject({
        binding: { kind: "component" },
      });
      expect(instanceNode("loose")).toMatchObject({
        binding: { kind: "interface", implementationName: null },
      });
      expect(nodes.find((node) => node.id === "p1")).toMatchObject({
        portDirection: null,
      });
    });

    it("draws an instance of a component of an import from its library, and as unresolved without it", () => {
      const library = resolveLibrary(logisticsLibrary.id, logisticsLibrary);
      const importing: SDCPN = {
        ...sdcpn,
        imports: [{ id: library.id }],
        componentInstances: [
          {
            id: "belt",
            name: "Belt",
            component: { from: library.id, id: "conveyor" },
            parameterValues: {},
            x: 0,
            y: 0,
          },
          {
            id: "stop",
            name: "Stop",
            component: { from: library.id, id: "station" },
            parameterValues: {},
            implementation: { from: library.id, id: "conveyor" },
            x: 0,
            y: 0,
          },
        ],
      };
      const sceneWith = (libraries: CanvasSceneInput["libraries"]) =>
        buildCanvasScene({
          ...input,
          sdcpn: importing,
          net: activeNet(importing),
          libraries,
        }).nodes.filter((node) => node.kind === "componentInstance");

      expect(sceneWith(new Map([[library.id, library]]))).toMatchObject([
        {
          componentName: "Conveyor",
          binding: { kind: "component" },
          color: "#2563eb",
          ports: [
            { id: toPetrinautId("in"), name: "In", direction: "in" },
            { id: toPetrinautId("out"), name: "Out", direction: "out" },
          ],
        },
        {
          componentName: "Station",
          binding: { kind: "interface", implementationName: "Conveyor" },
        },
      ]);
      expect(sceneWith(new Map())).toMatchObject([
        {
          componentName: "conveyor",
          binding: { kind: "unresolved" },
          ports: [],
        },
        {
          componentName: "station",
          binding: { kind: "unresolved" },
          ports: [],
        },
      ]);
    });

    it("gives a card the icon and colour of what it runs", () => {
      const icon = "<svg/>";
      const styled: SDCPN = {
        ...composed,
        components: [
          { ...iface, iconSvg: icon, displayColor: "#111111" },
          { ...fast, displayColor: "#222222" },
        ],
      };
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: styled,
        net: {
          ...styled,
          componentInstances: styled.componentInstances ?? [],
          fusions: [],
        },
      });
      const card = (id: string) => nodes.find((node) => node.id === id);

      // Runs Fast: its colour, and the interface's icon where Fast has none.
      expect(card("bound")).toMatchObject({ icon, color: "#222222" });
      // An instance of the component itself.
      expect(card("plain")).toMatchObject({ icon: null, color: "#222222" });
      // Nothing bound: the interface's own.
      expect(card("loose")).toMatchObject({ icon, color: "#111111" });
      // A component with neither leaves the defaults.
      const plain = buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: {
          ...composed,
          componentInstances: composed.componentInstances ?? [],
          fusions: [],
        },
      });
      expect(plain.nodes.find((node) => node.id === "plain")).toMatchObject({
        icon: null,
        color: null,
      });
    });

    it("folds an instance with many ports until it is unfolded", () => {
      const wide: Component = {
        ...fast,
        id: "wide",
        name: "Wide",
        implements: undefined,
        places: ["a", "b", "c", "d", "e"].map((name) => ({
          ...place(name, 0, 0),
          isPort: true,
        })),
      };
      const withWide: SDCPN = {
        ...sdcpn,
        components: [wide, fast],
        componentInstances: [
          instance("big", "wide"),
          instance("small", "fast"),
        ],
      };
      const net = activeNet(withWide);

      const folded = buildCanvasScene({ ...input, sdcpn: withWide, net });
      const foldedBig = folded.nodes.find((node) => node.id === "big");
      expect(foldedBig).toMatchObject({
        foldable: true,
        unfolded: false,
        height: compactNodeDimensions.componentInstance.height,
        anchorOffset: 0,
      });
      expect(folded.nodes.find((node) => node.id === "small")).toMatchObject({
        foldable: false,
        unfolded: true,
      });

      const unfolded = buildCanvasScene({
        ...input,
        sdcpn: withWide,
        net,
        unfoldedInstanceIds: new Set(["big"]),
      });
      const grown =
        getComponentInstanceHeight(compactNodeDimensions, 5) -
        compactNodeDimensions.componentInstance.height;
      expect(unfolded.nodes.find((node) => node.id === "big")).toMatchObject({
        unfolded: true,
        height: getComponentInstanceHeight(compactNodeDimensions, 5),
        // It unfolds downward, its header where it was: the centre moves by
        // half of what the card grew.
        anchorOffset: grown / 2,
        position: {
          x: foldedBig?.position.x,
          y: (foldedBig?.position.y ?? 0) + grown / 2,
        },
      });
    });

    it("colours an arc by the token type of the place or port at its end", () => {
      const wired: SDCPN = {
        ...composed,
        transitions: [
          {
            ...transition("t1", ["p1"], []),
            outputArcs: [
              {
                endpoint: {
                  kind: "componentPort",
                  componentInstanceId: "plain",
                  portPlaceId: "in",
                },
                weight: 1,
              },
            ],
          },
        ],
      };
      const { arcs } = buildCanvasScene({
        ...input,
        sdcpn: wired,
        net: activeNet(wired),
      });

      expect(arcs.find((arc) => arc.sourceId === "p1")?.color).toBe(
        arcStrokeColor(undefined),
      );
      expect(arcs.find((arc) => arc.targetPortId === "in")?.color).toBe(
        arcStrokeColor("#ff0000"),
      );
    });

    it("flags a port place inside a component with its direction", () => {
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: composed,
        net: { ...iface, componentInstances: [], fusions: [] },
      });

      expect(nodes.find((node) => node.id === "in")).toMatchObject({
        kind: "place",
        portDirection: "in",
        typeColor: "#ff0000",
      });
    });

    it("gives each instance ports of its own", () => {
      const twice: SDCPN = {
        ...sdcpn,
        components: [fast],
        componentInstances: [instance("one", "fast"), instance("two", "fast")],
      };
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: twice,
        net: activeNet(twice),
      });
      const portsOf = (id: string) => {
        const node = nodes.find((candidate) => candidate.id === id);
        return node?.kind === "componentInstance" ? node.ports : [];
      };

      expect(portsOf("one")).toEqual(portsOf("two"));
      expect(portsOf("one")).not.toBe(portsOf("two"));
      expect(portsOf("one")[0]).not.toBe(portsOf("two")[0]);
    });

    it("reads each list of a component and the defaults once, however many ports and instances there are", () => {
      const arcs = countReads();
      const types = countReads();
      const places = countReads();
      const defaults = countReads();
      // Forty ports that declare no direction, each of a token type of its
      // own, under four transitions that consume from the even ones and
      // produce into the odd ones.
      const names = Array.from({ length: 40 }, (_, index) => `port-${index}`);
      const wide: Component = {
        ...fast,
        id: "wide",
        name: "Wide",
        implements: undefined,
        types: types.of(
          names.map((name) => ({
            ...token,
            id: `type-${name}`,
            displayColor: `#${name}`,
          })),
        ),
        places: places.of(
          names.map((name) => ({
            ...place(name, 0, 0),
            isPort: true,
            colorId: `type-${name}`,
          })),
        ),
        transitions: Array.from({ length: 4 }, (_, index) => ({
          ...transition(`work-${index}`, [], []),
          inputArcs: arcs.of(
            names
              .filter((_name, port) => port % 2 === 0)
              .map((placeId) => ({
                placeId,
                weight: 1,
                type: "standard" as const,
              })),
          ),
          outputArcs: arcs.of(
            names
              .filter((_name, port) => port % 2 === 1)
              .map((placeId) => ({ placeId, weight: 1 })),
          ),
        })),
      };
      // Twenty instances of it, and twenty of an interface whose default is
      // the last of a long list.
      const many: SDCPN = {
        ...sdcpn,
        components: [iface, fast, wide],
        implementations: defaults.of([
          ...Array.from({ length: 40 }, (_, index) => ({
            interface: { id: `other${index}` },
            component: { id: "fast" },
          })),
          { interface: { id: "iface" }, component: { id: "fast" } },
        ]),
        componentInstances: Array.from({ length: 20 }, (_, index) => [
          instance(`wide-${index}`, "wide"),
          instance(`bound-${index}`, "iface"),
        ]).flat(),
      };

      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: many,
        net: activeNet(many),
      });

      const instances = nodes.filter(
        (node) => node.kind === "componentInstance",
      );
      expect(instances).toHaveLength(40);
      for (const node of instances) {
        if (node.id.startsWith("wide")) {
          expect(node.ports).toHaveLength(40);
          expect(node.ports.slice(0, 2)).toMatchObject([
            { id: "port-0", direction: "in", typeColor: "#port-0" },
            { id: "port-1", direction: "out", typeColor: "#port-1" },
          ]);
        } else {
          expect(node.binding).toEqual({
            kind: "interface",
            implementationName: "Fast",
          });
        }
      }
      // A search per port or per instance makes twenty passes or more.
      expect(arcs.reads()).toBeLessThanOrEqual(3 * 160);
      expect(types.reads()).toBeLessThanOrEqual(3 * names.length);
      expect(places.reads()).toBeLessThanOrEqual(3 * names.length);
      expect(defaults.reads()).toBeLessThanOrEqual(3 * 41);

      // Inside the component its ports are places of the net, and its arcs
      // are drawn as well.
      const readsBefore = arcs.reads();
      const inside = buildCanvasScene({
        ...input,
        sdcpn: many,
        net: { ...wide, componentInstances: [], fusions: [] },
      });

      expect(
        inside.nodes.flatMap((node) =>
          node.kind === "place" ? [node.portDirection] : [],
        ),
      ).toEqual(names.map((_name, port) => (port % 2 === 0 ? "in" : "out")));
      expect(arcs.reads() - readsBefore).toBeLessThanOrEqual(3 * 160);
    });
  });
});
