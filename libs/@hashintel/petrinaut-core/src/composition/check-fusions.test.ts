import { describe, expect, it } from "vitest";

import { checkComposition, checkFusions } from "./check-fusions";

import type { Color, Fusion, Place, SDCPN, Subnet } from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
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
        },
      ],
      places: [
        place("buffer", {
          colorId: "root_part",
          capacity: 5,
          dynamicsEnabled: true,
          differentialEquationId: "cool",
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
            },
          ],
          places: [
            place("in", {
              isPort: true,
              colorId: "part",
              capacity: 3,
              dynamicsEnabled: true,
              differentialEquationId: "heat",
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
            },
          ],
          places: [
            place("in", {
              isPort: true,
              colorId: "fluid",
              dynamicsEnabled: true,
              differentialEquationId: "drain",
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
      componentInstances: [instance("m1", "machine")],
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
        { id: "f2", members: [partIn("m1")] },
      ],
    });

    expect(
      checkFusions(sdcpn)
        .filter(({ severity }) => severity === "error")
        .map(({ code }) => code),
    ).toEqual(["duplicate-member", "multiple-anchors", "too-few-members"]);
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

describe("checkComposition", () => {
  it("reports places and transitions in a components-only net", () => {
    const sdcpn = net({
      componentsOnly: true,
      places: [place("stray")],
    });

    expect(checkComposition(sdcpn)).toMatchObject([
      { kind: "components-only", placeCount: 1, transitionCount: 0 },
    ]);
  });

  it("is silent on a components-only net built from instances alone", () => {
    const sdcpn = net({
      componentsOnly: true,
      subnets: [subnet("cell", { places: [place("in", { isPort: true })] })],
      componentInstances: [instance("c1", "cell")],
    });

    expect(
      checkComposition(sdcpn).filter(({ severity }) => severity === "error"),
    ).toEqual([]);
  });
});

describe("port directions in fusions", () => {
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
});
