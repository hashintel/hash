import { describe, expect, it } from "vitest";

import { checkComposition } from "./check-composition";
import { checkFusions } from "./check-fusions";

import type {
  Color,
  Fusion,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";

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

const subnet = (id: string, overrides: Partial<Subnet> = {}): Subnet => ({
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

const instance = (id: string, subnetId: string) => ({
  id,
  name: id,
  subnetId,
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
      subnets: [
        subnet("machine", {
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
      subnets: [subnet("machine", { places: [place("in")] })],
      componentInstances: [instance("m1", "machine")],
      fusions: [
        {
          id: "f1",
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
      subnets: [
        subnet("machine", {
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

  it("accepts the same equation on two instances of one subnet", () => {
    const sdcpn = net({
      subnets: [
        subnet("tank", {
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
      fusions: [{ id: "f1", members: [partIn("t1"), partIn("t2")] }],
    });

    expect(
      checkFusions(sdcpn).filter(({ severity }) => severity === "error"),
    ).toEqual([]);
  });

  it("reports duplicate members, a second anchor and a lone member", () => {
    const sdcpn = net({
      places: [place("a"), place("b")],
      subnets: [subnet("machine", { places: [place("in", { isPort: true })] })],
      componentInstances: [
        instance("m1", "machine"),
        instance("m2", "machine"),
      ],
      fusions: [
        {
          id: "f1",
          members: [
            { kind: "place", placeId: "a" },
            { kind: "place", placeId: "b" },
            partIn("m1"),
            partIn("m1"),
          ],
        },
        { id: "f2", members: [partIn("m2")] },
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
      subnets: [subnet("machine", { places: [place("in", { isPort: true })] })],
      componentInstances: [instance("m1", "machine")],
      fusions: [
        { id: "f1", members: [{ kind: "place", placeId: "a" }, partIn("m1")] },
        { id: "f2", members: [{ kind: "place", placeId: "b" }, partIn("m1")] },
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
      "m1.in is in the fusion a and in another fusion of this net: a place or port belongs to one fusion.",
    );
  });

  it("says a message is about a fusion, whatever names it", () => {
    const sdcpn = net({
      places: [place("a"), place("b")],
      fusions: [
        {
          id: "f1",
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
      "More than one place of this net is in the fusion a; fuse ports into one place instead.",
    );
  });

  it("checks the fusions inside subnets, naming the subnet", () => {
    const sdcpn = net({
      subnets: [
        subnet("cell", { places: [place("in", { isPort: true })] }),
        subnet("line", {
          places: [place("feed")],
          componentInstances: [instance("c1", "cell")],
          fusions: [
            {
              id: "f1",
              members: [{ kind: "place", placeId: "feed" }, partIn("missing")],
            },
          ],
        }),
      ],
    });

    expect(
      checkFusions(sdcpn).filter(({ severity }) => severity === "error"),
    ).toMatchObject([
      { subnetId: "line", fusionId: "f1", code: "unresolved-member" },
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

  const stage = subnet("stage", {
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
      subnets: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        { id: "f1", members: [portOf("s1", "out"), portOf("s2", "in")] },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("warns on two inputs fused together, and notes two outputs", () => {
    const sdcpn = net({
      subnets: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        { id: "f1", members: [portOf("s1", "in"), portOf("s2", "in")] },
        { id: "f2", members: [portOf("s1", "out"), portOf("s2", "out")] },
      ],
    });

    expect(checkFusions(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "no-producer", severity: "warning" },
      { fusionId: "f2", code: "no-consumer", severity: "info" },
    ]);
  });

  it("does not count a port that is only read as one that empties the fused place", () => {
    const gauge = subnet("gauge", {
      places: [place("level", { isPort: true })],
      transitions: [
        {
          ...transition("watch", [], []),
          inputArcs: [{ placeId: "level", weight: 1, type: "read" as const }],
        },
      ],
    });
    const sdcpn = net({
      subnets: [stage, gauge],
      componentInstances: [instance("s1", "stage"), instance("g1", "gauge")],
      fusions: [
        { id: "f1", members: [portOf("s1", "out"), portOf("g1", "level")] },
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
      subnets: [stage],
      componentInstances: [instance("s1", "stage"), instance("s2", "stage")],
      fusions: [
        {
          id: "f1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
        { id: "f2", members: [portOf("s1", "out"), portOf("s2", "out")] },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("leaves the flow through an anchor that is itself a port to the net above", () => {
    const line = subnet("line", {
      places: [place("feed", { isPort: true })],
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
      ],
    });
    const sdcpn = net({
      subnets: [stage, line],
      componentInstances: [instance("l1", "line")],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("reads the far side of an anchor port off the direction the port declares", () => {
    const lineWith = (portDirection: "in" | "out") =>
      net({
        subnets: [
          stage,
          subnet("line", {
            places: [place("feed", { isPort: true, portDirection })],
            componentInstances: [instance("s1", "stage")],
            fusions: [
              {
                id: "f1",
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
      { subnetId: "line", code: "no-producer" },
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
      subnets: [stage],
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          members: [{ kind: "place", placeId: "feed" }, portOf("s1", "in")],
        },
      ],
    });

    expect(checkFusions(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "repeated-arc", severity: "error" },
    ]);
  });

  it("reports a type mismatch once, however many members disagree", () => {
    const typed = subnet("typed", {
      types: [
        color("part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
      places: [place("in", { isPort: true, colorId: "part" })],
    });
    const sdcpn = net({
      places: [place("feed")],
      subnets: [typed],
      componentInstances: [instance("t1", "typed"), instance("t2", "typed")],
      fusions: [
        {
          id: "f1",
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
    const sink = subnet("sink", {
      places: [place("in", { isPort: true, portDirection: "inout" })],
      transitions: [transition("absorb", ["in"], [])],
    });
    const sdcpn = net({
      subnets: [sink],
      componentInstances: [instance("k1", "sink"), instance("k2", "sink")],
      fusions: [
        { id: "f1", members: [portOf("k1", "in"), portOf("k2", "in")] },
      ],
    });

    expect(checkFusions(sdcpn)).toEqual([]);
  });

  it("reports a port declared input that its subnet writes to", () => {
    const sdcpn = net({
      subnets: [
        subnet("loop", {
          places: [place("pool", { isPort: true, portDirection: "in" })],
          transitions: [transition("cycle", ["pool"], ["pool"])],
        }),
      ],
    });

    expect(checkComposition(sdcpn)).toMatchObject([
      { kind: "port", subnetId: "loop", placeId: "pool", severity: "warning" },
    ]);
  });

  it("holds a port to its direction through what its subnet fuses with it", () => {
    // Inside the line, the port is fused with a port of a stage, and a
    // transition of the line touches that port of the stage: fused, the two
    // are one place.
    const line = (
      direction: "in" | "out",
      touch: Pick<Transition, "inputArcs" | "outputArcs">,
    ) =>
      subnet("line", {
        places: [place("edge", { isPort: true, portDirection: direction })],
        componentInstances: [instance("s1", "stage")],
        fusions: [
          {
            id: "f1",
            members: [{ kind: "place", placeId: "edge" }, portOf("s1", "in")],
          },
        ],
        transitions: [{ ...transition("touch", [], []), ...touch }],
      });
    const problems = (...lineArguments: Parameters<typeof line>) =>
      checkComposition(
        net({ subnets: [stage, line(...lineArguments)] }),
      ).filter(({ kind }) => kind === "port");
    const arc = { endpoint: portOf("s1", "in"), weight: 1 };

    expect(problems("in", { inputArcs: [], outputArcs: [arc] })).toMatchObject([
      { subnetId: "line", placeId: "edge" },
    ]);
    expect(
      problems("out", {
        inputArcs: [{ ...arc, type: "standard" }],
        outputArcs: [],
      }),
    ).toMatchObject([{ subnetId: "line", placeId: "edge" }]);
    expect(
      problems("in", {
        inputArcs: [{ ...arc, type: "standard" }],
        outputArcs: [],
      }),
    ).toEqual([]);
  });

  it("tags fusion and port problems by kind", () => {
    const sdcpn = net({
      subnets: [
        subnet("loop", {
          places: [place("pool", { isPort: true, portDirection: "out" })],
          transitions: [transition("cycle", ["pool"], ["pool"])],
        }),
      ],
      componentInstances: [instance("l1", "loop")],
      fusions: [{ id: "f1", members: [portOf("l1", "pool")] }],
    });

    const kinds = checkComposition(sdcpn).map(({ kind }) => kind);
    expect(kinds).toContain("fusion");
    expect(kinds).toContain("port");
    expect(kinds.indexOf("port")).toBeGreaterThan(kinds.lastIndexOf("fusion"));
  });
});
