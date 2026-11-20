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

import { logisticsLibrary } from "../../libraries-story-fixtures";
import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import { buildCanvasScene, type CanvasSceneInput } from "./canvas-scene";
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
  fusionStatuses: new Map(),
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  dimensions: compactNodeDimensions,
  dragPreview: new Map(),
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
        fusionStatuses: new Map([["fusion-left", { severity: "warning" }]]),
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

  it("reads a component's arcs once for the directions of its ports, however many ports and instances it has", () => {
    // Two hundred ports that declare no direction, under 24,000 arcs: the
    // even ones are consumed from and the odd ones produced into.
    const ports = Array.from({ length: 200 }, (_, index) => ({
      ...place(`port-${index}`, 0, 0),
      isPort: true,
    }));
    const consumed = ports.filter((_, index) => index % 2 === 0);
    const produced = ports.filter((_, index) => index % 2 === 1);
    const wide = {
      id: "wide",
      name: "Wide",
      places: ports,
      transitions: Array.from({ length: 120 }, (_, index) => ({
        ...transition(`work-${index}`, [], []),
        inputArcs: consumed.map(({ id }) => ({
          placeId: id,
          weight: 1,
          type: "standard" as const,
        })),
        outputArcs: produced.map(({ id }) => ({ placeId: id, weight: 1 })),
      })),
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const composed: SDCPN = {
      ...sdcpn,
      components: [wide],
      componentInstances: Array.from({ length: 20 }, (_, index) => ({
        id: `wide-${index}`,
        name: `Wide ${index}`,
        component: { id: "wide" },
        parameterValues: {},
        x: 0,
        y: index * 100,
      })),
    };

    const started = Date.now();
    const { nodes } = buildCanvasScene({
      ...input,
      sdcpn: composed,
      net: {
        ...composed,
        componentInstances: composed.componentInstances ?? [],
        fusions: [],
      },
    });
    const elapsed = Date.now() - started;

    const instances = nodes.filter((node) => node.kind === "componentInstance");
    expect(instances).toHaveLength(20);
    for (const instance of instances) {
      expect(instance.ports).toHaveLength(200);
      expect(instance.ports.slice(0, 2)).toMatchObject([
        { id: "port-0", name: "port-0", direction: "in" },
        { id: "port-1", name: "port-1", direction: "out" },
      ]);
    }
    expect(elapsed).toBeLessThan(1000);
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

    it("reads the arcs of the net it shows once for the directions of its own ports", () => {
      // A thousand ports that declare no direction, under 20,000 arcs that
      // consume from them.
      const ports = Array.from({ length: 1000 }, (_, index) => ({
        ...place(`port-${index}`, 0, 0),
        isPort: true,
      }));
      const wide: Component = {
        ...fast,
        id: "wide",
        name: "Wide",
        places: ports,
        transitions: Array.from({ length: 20 }, (_, index) => ({
          ...transition(`take-${index}`, [], []),
          inputArcs: ports.map(({ id }) => ({
            placeId: id,
            weight: 1,
            type: "standard" as const,
          })),
        })),
      };

      const started = Date.now();
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: { ...sdcpn, components: [wide] },
        net: { ...wide, componentInstances: [], fusions: [] },
      });
      const elapsed = Date.now() - started;

      expect(
        new Set(
          nodes.flatMap((node) =>
            node.kind === "place" ? [node.portDirection] : [],
          ),
        ),
      ).toEqual(new Set(["in"]));
      // Reading the arcs for each port takes several seconds.
      expect(elapsed).toBeLessThan(1000);
    });

    it("looks up the token types of a component's ports once, however many ports and instances it has", () => {
      // Four thousand ports, each of a token type of its own.
      const names = Array.from({ length: 4000 }, (_, index) => `port-${index}`);
      const wide: Component = {
        ...fast,
        id: "wide",
        name: "Wide",
        types: names.map((name) => ({
          ...token,
          id: `type-${name}`,
          displayColor: `#${name}`,
        })),
        places: names.map((name) => ({
          ...place(name, 0, 0),
          isPort: true,
          portDirection: "in" as const,
          colorId: `type-${name}`,
        })),
      };
      const many: SDCPN = {
        ...sdcpn,
        components: [wide],
        componentInstances: Array.from({ length: 200 }, (_, index) =>
          instance(`wide-${index}`, "wide"),
        ),
      };

      const started = Date.now();
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: many,
        net: activeNet(many),
      });
      const elapsed = Date.now() - started;

      const instances = nodes.filter(
        (node) => node.kind === "componentInstance",
      );
      expect(instances).toHaveLength(200);
      for (const node of instances) {
        expect(node.ports).toHaveLength(names.length);
        expect(node.ports.at(-1)).toMatchObject({
          id: "port-3999",
          direction: "in",
          typeColor: "#port-3999",
        });
      }
      // A search of the types for each port of each instance takes seconds.
      expect(elapsed).toBeLessThan(1000);
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

    it("finds the port at the end of each arc without a search of the instance's ports", () => {
      // Ten thousand ports of one instance, each reached by ten arcs.
      const names = Array.from(
        { length: 10_000 },
        (_, index) => `port-${index}`,
      );
      const wide: Component = {
        ...fast,
        id: "wide",
        name: "Wide",
        places: names.map((name) => ({
          ...place(name, 0, 0),
          isPort: true,
          portDirection: "in" as const,
          colorId: "tok",
        })),
      };
      const wired: SDCPN = {
        ...sdcpn,
        components: [wide],
        componentInstances: [instance("w1", "wide")],
        transitions: Array.from({ length: 10 }, (_, index) => ({
          ...transition(`feed-${index}`, [], []),
          outputArcs: names.map((portPlaceId) => ({
            endpoint: {
              kind: "componentPort" as const,
              componentInstanceId: "w1",
              portPlaceId,
            },
            weight: 1,
          })),
        })),
      };

      const started = Date.now();
      const { arcs } = buildCanvasScene({
        ...input,
        sdcpn: wired,
        net: activeNet(wired),
      });
      const elapsed = Date.now() - started;

      expect(arcs).toHaveLength(100_000);
      expect(new Set(arcs.map(({ color }) => color))).toEqual(
        new Set([arcStrokeColor("#ff0000")]),
      );
      // A search of the ports for each arc takes several seconds.
      expect(elapsed).toBeLessThan(1000);
    });

    it("resolves many instances against a long list of defaults, with one read of the list", () => {
      const size = 30_000;
      const many: SDCPN = {
        ...sdcpn,
        components: [iface, fast],
        implementations: [
          ...Array.from({ length: size }, (_, index) => ({
            interface: { id: `other${index}` },
            component: { id: "fast" },
          })),
          { interface: { id: "iface" }, component: { id: "fast" } },
        ],
        componentInstances: Array.from({ length: size }, (_, index) =>
          instance(`bound-${index}`, "iface"),
        ),
      };

      const started = Date.now();
      const { nodes } = buildCanvasScene({
        ...input,
        sdcpn: many,
        net: activeNet(many),
      });
      const elapsed = Date.now() - started;

      const bindings = new Set(
        nodes.flatMap((node) =>
          node.kind === "componentInstance"
            ? [JSON.stringify(node.binding)]
            : [],
        ),
      );
      expect([...bindings]).toEqual([
        JSON.stringify({ kind: "interface", implementationName: "Fast" }),
      ]);
      // A search of the defaults for every instance takes several seconds.
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
