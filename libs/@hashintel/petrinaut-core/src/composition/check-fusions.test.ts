import { describe, expect, it } from "vitest";

import { checkComposition } from "./check-composition";
import { checkFusions } from "./check-fusions";

import type { Color, Component, Fusion, Place, SDCPN } from "../types/sdcpn";
import type { ResolvedLibraries } from "./libraries";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...overrides,
});

const color = (id: string, elements: Color["elements"]): Color => ({
  id,
  name: id,
  iconSlug: "circle",
  displayColor: "#000",
  elements,
});

const component = (
  id: string,
  overrides: Partial<Component> = {},
): Component => ({
  id,
  name: id,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const net = (overrides: Partial<SDCPN> = {}): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const partIn = (instanceId: string): Fusion["members"][number] => ({
  kind: "componentPort",
  componentInstanceId: instanceId,
  portPlaceId: "in",
});

const instance = (id: string, componentId: string) => ({
  id,
  name: id,
  component: { id: componentId },
  parameterValues: {},
  x: 0,
  y: 0,
});

describe("checkFusions", () => {
  it("accepts a place fused with ports of the same token structure", () => {
    const sdcpn = net({
      types: [
        color("root_part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
      places: [place("buffer", { colorId: "root_part" })],
      components: [
        component("machine", {
          types: [
            color("part", [{ elementId: "w", name: "weight", type: "real" }]),
          ],
          places: [place("in", { isPort: true, colorId: "part" })],
        }),
      ],
      componentInstances: [
        instance("m1", "machine"),
        instance("m2", "machine"),
      ],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [
            { kind: "place", placeId: "buffer" },
            partIn("m1"),
            partIn("m2"),
          ],
        },
      ],
    });

    expect(
      checkFusions(sdcpn).filter(({ severity }) => severity === "error"),
    ).toEqual([]);
  });

  it("reports members that do not resolve to a port", () => {
    const sdcpn = net({
      places: [place("buffer")],
      components: [component("machine", { places: [place("in")] })],
      componentInstances: [instance("m1", "machine")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "buffer" }, partIn("m1")],
        },
      ],
    });

    expect(
      checkFusions(sdcpn)
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code),
    ).toEqual(["unresolved-member"]);
  });

  it("reports token types, capacities and dynamics that disagree", () => {
    const sdcpn = net({
      types: [
        color("root_part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
      differentialEquations: [
        {
          id: "cool",
          name: "Cool",
          colorId: "root_part",
          code: "return tokens;",
          arity: 1,
        },
      ],
      places: [
        place("buffer", {
          colorId: "root_part",
          capacity: 5,
          dynamicsEnabled: true,
          dynamics: [{ differentialEquationId: "cool" }],
        }),
      ],
      components: [
        component("machine", {
          types: [
            color("part", [{ elementId: "n", name: "count", type: "integer" }]),
          ],
          differentialEquations: [
            {
              id: "heat",
              name: "Heat",
              colorId: "part",
              code: "return tokens;",
              arity: 1,
            },
          ],
          places: [
            place("in", {
              isPort: true,
              colorId: "part",
              capacity: 3,
              dynamicsEnabled: true,
              dynamics: [{ differentialEquationId: "heat" }],
            }),
          ],
        }),
      ],
      componentInstances: [instance("m1", "machine")],
      fusions: [
        {
          id: "f1",
          name: "Shared buffer",
          members: [{ kind: "place", placeId: "buffer" }, partIn("m1")],
        },
      ],
    });

    expect(
      checkFusions(sdcpn)
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code),
    ).toEqual(["color-mismatch", "capacity-mismatch", "dynamics-conflict"]);
  });

  it("accepts the same equation on two instances of one component", () => {
    const sdcpn = net({
      components: [
        component("tank", {
          types: [
            color("fluid", [{ elementId: "l", name: "level", type: "real" }]),
          ],
          differentialEquations: [
            {
              id: "drain",
              name: "Drain",
              colorId: "fluid",
              code: "return tokens;",
              arity: 1,
            },
          ],
          places: [
            place("in", {
              isPort: true,
              colorId: "fluid",
              dynamicsEnabled: true,
              dynamics: [{ differentialEquationId: "drain" }],
            }),
          ],
        }),
      ],
      componentInstances: [instance("t1", "tank"), instance("t2", "tank")],
      fusions: [
        { id: "f1", name: "F1", members: [partIn("t1"), partIn("t2")] },
      ],
    });

    expect(
      checkFusions(sdcpn).filter(({ severity }) => severity === "error"),
    ).toEqual([]);
  });

  describe("an equation id that two nets each define", () => {
    const fluid = color("fluid", [
      { elementId: "l", name: "level", type: "real" },
    ]);
    const cool = (code: string) => ({
      id: "cool",
      name: "Cool",
      colorId: "fluid",
      code,
      arity: 1,
    });
    const cooled = (id: string, overrides: Partial<Place> = {}) =>
      place(id, {
        colorId: "fluid",
        dynamicsEnabled: true,
        dynamics: [{ differentialEquationId: "cool" }],
        ...overrides,
      });
    /** A component whose port runs the equation the component defines as `cool`. */
    const cooler = (id: string, code: string) =>
      component(id, {
        types: [fluid],
        differentialEquations: [cool(code)],
        places: [cooled("in", { isPort: true })],
      });
    const errorCodes = (sdcpn: SDCPN, libraries?: ResolvedLibraries) =>
      checkFusions(sdcpn, libraries)
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code);

    it("reports the ports of two components", () => {
      const sdcpn = net({
        components: [
          cooler("bath", "return { level: -1 };"),
          cooler("kiln", "return { level: 1 };"),
        ],
        componentInstances: [instance("b1", "bath"), instance("k1", "kiln")],
        fusions: [
          { id: "f1", name: "F1", members: [partIn("b1"), partIn("k1")] },
        ],
      });

      expect(errorCodes(sdcpn)).toEqual(["dynamics-conflict"]);
    });

    it("reports the ports of a component and of a library's component under its id", () => {
      const libraries: ResolvedLibraries = new Map([
        [
          "lib",
          {
            id: "lib",
            name: "Lib",
            components: [cooler("bath", "return { level: 1 };")],
          },
        ],
      ]);
      const sdcpn = net({
        components: [cooler("bath", "return { level: -1 };")],
        componentInstances: [
          instance("b1", "bath"),
          { ...instance("l1", "bath"), component: { from: "lib", id: "bath" } },
        ],
        fusions: [
          { id: "f1", name: "F1", members: [partIn("b1"), partIn("l1")] },
        ],
      });

      expect(errorCodes(sdcpn, libraries)).toEqual(["dynamics-conflict"]);
    });

    it("reports a root place and the port of a component", () => {
      const sdcpn = net({
        types: [fluid],
        differentialEquations: [cool("return { level: 1 };")],
        places: [cooled("tank")],
        components: [cooler("bath", "return { level: -1 };")],
        componentInstances: [instance("b1", "bath")],
        fusions: [
          {
            id: "f1",
            name: "F1",
            members: [{ kind: "place", placeId: "tank" }, partIn("b1")],
          },
        ],
      });

      expect(errorCodes(sdcpn)).toEqual(["dynamics-conflict"]);
    });
  });

  it("reports duplicate members, a second anchor and a lone member", () => {
    const sdcpn = net({
      places: [place("a"), place("b")],
      components: [
        component("machine", { places: [place("in", { isPort: true })] }),
      ],
      componentInstances: [
        instance("m1", "machine"),
        instance("m2", "machine"),
      ],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [
            { kind: "place", placeId: "a" },
            { kind: "place", placeId: "b" },
            partIn("m1"),
            partIn("m1"),
          ],
        },
        { id: "f2", name: "F2", members: [partIn("m2")] },
      ],
    });

    expect(
      checkFusions(sdcpn)
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code),
    ).toEqual(["duplicate-member", "multiple-anchors", "too-few-members"]);
  });

  it("reports a place or port that two fusions of one net hold", () => {
    const sdcpn = net({
      places: [place("a"), place("b")],
      components: [
        component("machine", { places: [place("in", { isPort: true })] }),
      ],
      componentInstances: [instance("m1", "machine")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "a" }, partIn("m1")],
        },
        {
          id: "f2",
          name: "F2",
          members: [{ kind: "place", placeId: "b" }, partIn("m1")],
        },
      ],
    });

    const shared = checkFusions(sdcpn).filter(
      ({ code }) => code === "shared-member",
    );
    expect(
      shared.map(({ fusionId, severity }) => [fusionId, severity]),
    ).toEqual([
      ["f1", "error"],
      ["f2", "error"],
    ]);
    expect(shared[0]?.message).toBe(
      "m1.in is in the fusion F1 and in another fusion of this net: a place or port belongs to one fusion.",
    );
  });

  it("names a fusion by its own name, not a member's", () => {
    const sdcpn = net({
      places: [place("a"), place("b")],
      fusions: [
        {
          id: "f1",
          name: "Belt",
          members: [
            { kind: "place", placeId: "a" },
            { kind: "place", placeId: "b" },
          ],
        },
      ],
    });

    expect(
      checkFusions(sdcpn).find(({ code }) => code === "multiple-anchors")
        ?.message,
    ).toBe(
      "More than one place of this net is in the fusion Belt; fuse ports into one place instead.",
    );
  });

  it("checks the fusions inside components, naming the component", () => {
    const sdcpn = net({
      components: [
        component("cell", { places: [place("in", { isPort: true })] }),
        component("line", {
          places: [place("feed")],
          componentInstances: [instance("c1", "cell")],
          fusions: [
            {
              id: "f1",
              name: "F1",
              members: [{ kind: "place", placeId: "feed" }, partIn("missing")],
            },
          ],
        }),
      ],
    });

    expect(
      checkFusions(sdcpn).filter(({ severity }) => severity === "error"),
    ).toMatchObject([
      { componentId: "line", fusionId: "f1", code: "unresolved-member" },
    ]);
  });
});

describe("token flow through fused ports", () => {
  const transition = (id: string, inputs: string[], outputs: string[]) => ({
    id,
    name: id,
    inputArcs: inputs.map((placeId) => ({
      placeId,
      weight: 1,
      type: "standard" as const,
    })),
    outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
    lambdaType: "predicate" as const,
    lambdaCode: "",
    transitionKernelCode: "",
    x: 0,
    y: 0,
  });

  const stage = component("stage", {
    places: [place("in", { isPort: true }), place("out", { isPort: true })],
    transitions: [transition("work", ["in"], ["out"])],
  });

  const portOf = (instanceId: string, portPlaceId: string) => ({
    kind: "componentPort" as const,
    componentInstanceId: instanceId,
    portPlaceId,
  });

  it("is quiet on an output fused with an input", () => {
    const sdcpn = net({
      components: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [portOf("s1", "out"), portOf("s2", "in")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("warns on two inputs fused together, and notes two outputs", () => {
    const sdcpn = net({
      components: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [portOf("s1", "in"), portOf("s2", "in")],
        },
        {
          id: "f2",
          name: "F2",
          members: [portOf("s1", "out"), portOf("s2", "out")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "no-producer", severity: "warning" },
      { fusionId: "f2", code: "no-consumer", severity: "info" },
    ]);
  });

  it("does not count a port that is only read as one that empties the fused place", () => {
    const gauge = component("gauge", {
      places: [place("level", { isPort: true })],
      transitions: [
        {
          ...transition("watch", [], []),
          inputArcs: [{ placeId: "level", weight: 1, type: "read" as const }],
        },
      ],
    });
    const sdcpn = net({
      components: [stage, gauge],
      componentInstances: [instance("s1", "stage"), instance("g1", "gauge")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [portOf("s1", "out"), portOf("g1", "level")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "no-consumer", severity: "info" },
    ]);
  });

  it("counts the root net's arcs on the anchor and on instance ports", () => {
    const sdcpn = net({
      places: [place("feed")],
      transitions: [
        transition("supply", [], ["feed"]),
        {
          ...transition("drain", [], []),
          inputArcs: [
            {
              endpoint: portOf("s1", "out"),
              weight: 1,
              type: "standard" as const,
            },
          ],
        },
      ],
      components: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
        {
          id: "f2",
          name: "F2",
          members: [portOf("s1", "out"), portOf("s2", "out")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("leaves the flow through an anchor that is itself a port to the net above", () => {
    const line = component("line", {
      places: [place("feed", { isPort: true })],
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
      ],
    });
    const sdcpn = net({
      components: [stage, line],
      componentInstances: [instance("l1", "line")],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("reads the far side of an anchor port off the direction the port declares", () => {
    const lineWith = (portDirection: "in" | "out") =>
      net({
        components: [
          stage,
          component("line", {
            places: [place("feed", { isPort: true, portDirection })],
            componentInstances: [instance("s1", "stage")],
            fusions: [
              {
                id: "f1",
                name: "F1",
                members: [
                  { kind: "place", placeId: "feed" },
                  portOf("s1", "in"),
                ],
              },
            ],
          }),
        ],
      });

    // An input port of the line is filled by the net above it.
    expect(checkFusions(lineWith("in"))).toEqual([]);
    // An output port is emptied from above, and the stage only consumes too.
    expect(checkFusions(lineWith("out"))).toMatchObject([
      { componentId: "line", code: "no-producer" },
    ]);
  });

  it("reports a transition that reaches the fused place through two arcs of one kind", () => {
    const sdcpn = net({
      places: [place("feed")],
      transitions: [
        {
          ...transition("supply", [], ["feed"]),
          outputArcs: [
            { placeId: "feed", weight: 1 },
            { endpoint: portOf("s1", "in"), weight: 1 },
          ],
        },
      ],
      components: [stage],
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "repeated-arc", severity: "error" },
    ]);
  });

  it("reports a type mismatch once, however many members disagree", () => {
    const typed = component("typed", {
      types: [
        color("part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
      places: [place("in", { isPort: true, colorId: "part" })],
    });
    const sdcpn = net({
      places: [place("feed")],
      components: [typed],
      componentInstances: [instance("t1", "typed"), instance("t2", "typed")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [
            { kind: "place", placeId: "feed" },
            partIn("t1"),
            partIn("t2"),
          ],
        },
      ],
    });

    expect(
      checkFusions(sdcpn).filter(({ code }) => code === "color-mismatch"),
    ).toHaveLength(1);
  });

  it("takes a declared direction over the arcs", () => {
    const sink = component("sink", {
      places: [place("in", { isPort: true, portDirection: "inout" })],
      transitions: [transition("absorb", ["in"], [])],
    });
    const sdcpn = net({
      components: [sink],
      componentInstances: [instance("k1", "sink"), instance("k2", "sink")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [portOf("k1", "in"), portOf("k2", "in")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("reads a component's arcs once for its fused ports that declare no direction, however many", () => {
    // A thousand ports that declare no direction, under 20,000 arcs that
    // consume from them.
    const ports = Array.from({ length: 1000 }, (_, index) =>
      place(`port-${index}`, { isPort: true }),
    );
    const portIds = ports.map(({ id }) => id);
    const wide = component("wide", {
      places: ports,
      transitions: Array.from({ length: 20 }, (_, index) =>
        transition(`take-${index}`, portIds, []),
      ),
    });
    const sdcpn = net({
      components: [wide],
      componentInstances: [instance("w1", "wide"), instance("w2", "wide")],
      fusions: portIds.map((id) => ({
        id: `fusion-${id}`,
        name: id,
        members: [portOf("w1", id), portOf("w2", id)],
      })),
    });

    const started = Date.now();
    const problems = checkFusions(sdcpn);
    const elapsed = Date.now() - started;

    // Each fused place is consumed from on both sides, and never filled.
    expect(problems).toHaveLength(portIds.length);
    expect(new Set(problems.map(({ code }) => code))).toEqual(
      new Set(["no-producer"]),
    );
    expect(elapsed).toBeLessThan(1000);
  });

  it("tags fusion and port problems by kind", () => {
    const sdcpn = net({
      components: [
        component("loop", {
          places: [place("pool", { isPort: true, portDirection: "out" })],
          transitions: [transition("cycle", ["pool"], ["pool"])],
        }),
      ],
      componentInstances: [instance("l1", "loop")],
      fusions: [{ id: "f1", name: "F1", members: [portOf("l1", "pool")] }],
    });

    const kinds = checkComposition(sdcpn).map(({ kind }) => kind);
    expect(kinds).toContain("fusion");
    expect(kinds).toContain("port");
    expect(kinds.indexOf("port")).toBeGreaterThan(kinds.lastIndexOf("fusion"));
  });
});
