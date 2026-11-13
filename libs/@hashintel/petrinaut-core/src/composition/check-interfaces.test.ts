import { describe, expect, it } from "vitest";

import { checkFusions } from "./check-fusions";
import { checkInterfaces } from "./check-interfaces";
import { mapInterfacePorts, resolveImplementation } from "./interfaces";

import type {
  Color,
  Parameter,
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

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): Transition => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard",
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const parameter = (
  id: string,
  variableName: string,
  type: Parameter["type"] = "real",
): Parameter => ({
  id,
  name: variableName,
  variableName,
  type,
  defaultValue: "1",
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

const instance = (id: string, subnetId: string, implementation?: string) => ({
  id,
  name: id,
  subnetId,
  parameterValues: {},
  x: 0,
  y: 0,
  ...(implementation === undefined ? {} : { implementation }),
});

/** A stage signature: In consumed, Out produced, a rate parameter. */
const stage = subnet("stage", {
  interface: true,
  places: [
    place("stage_in", { name: "In", isPort: true, portDirection: "in" }),
    place("stage_out", { name: "Out", isPort: true, portDirection: "out" }),
  ],
  parameters: [parameter("stage_rate", "rate")],
});

const fast = subnet("fast", {
  implements: ["stage"],
  places: [
    place("fast_in", { name: "In", isPort: true }),
    place("fast_out", { name: "Out", isPort: true }),
  ],
  transitions: [transition("work", ["fast_in"], ["fast_out"])],
  parameters: [parameter("fast_rate", "rate")],
});

describe("checkInterfaces", () => {
  it("accepts an implementation with the interface's ports and parameters", () => {
    expect(checkInterfaces(net({ subnets: [stage, fast] }))).toEqual([]);
  });

  it("reports an interface that holds a transition", () => {
    const bodied = subnet("bodied", {
      interface: true,
      places: [place("in", { isPort: true })],
      transitions: [transition("t", ["in"], [])],
    });

    expect(checkInterfaces(net({ subnets: [bodied] }))).toMatchObject([
      { subnetId: "bodied", code: "interface-has-body", severity: "error" },
    ]);
  });

  it("reports a missing port, a different token type, a direction against the declaration and a missing parameter", () => {
    const partial = subnet("partial", {
      implements: ["stage"],
      types: [
        color("part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
      places: [place("p_in", { name: "In", isPort: true, colorId: "part" })],
      transitions: [transition("loop", ["p_in"], ["p_in"])],
    });

    expect(
      checkInterfaces(net({ subnets: [stage, partial] })).map(
        ({ code, severity }) => [code, severity],
      ),
    ).toEqual([
      ["port-type-mismatch", "error"],
      ["port-direction-mismatch", "warning"],
      ["missing-port", "error"],
      ["missing-parameter", "error"],
    ]);
  });

  it("reports implementing something that is not an interface", () => {
    const other = subnet("other");
    const wrong = subnet("wrong", { implements: ["other", "ghost"] });

    expect(
      checkInterfaces(net({ subnets: [other, wrong] })).map(({ code }) => code),
    ).toEqual(["unknown-interface", "unknown-interface"]);
  });

  it("reports an instance of an interface with nothing bound, and accepts a document default or an instance choice", () => {
    const unbound = net({
      subnets: [stage, fast],
      componentInstances: [instance("s1", "stage")],
    });
    expect(checkInterfaces(unbound)).toMatchObject([
      { subnetId: null, instanceId: "s1", code: "unbound-instance" },
    ]);

    const byDefault = { ...unbound, implementations: { stage: "fast" } };
    expect(checkInterfaces(byDefault)).toEqual([]);

    const byInstance = net({
      subnets: [stage, fast],
      componentInstances: [instance("s1", "stage", "fast")],
    });
    expect(checkInterfaces(byInstance)).toEqual([]);
  });

  it("reports a binding to a subnet that does not implement the interface, naming it", () => {
    const stranger = subnet("stranger");
    const sdcpn = net({
      subnets: [stage, fast, stranger],
      componentInstances: [instance("s1", "stage", "stranger")],
    });

    const problems = checkInterfaces(sdcpn);
    expect(problems).toMatchObject([
      { instanceId: "s1", code: "unbound-instance" },
    ]);
    expect(problems[0]?.message).toContain("does not implement stage");
  });

  it("checks instances inside subnets against the document's defaults", () => {
    const line = subnet("line", {
      componentInstances: [instance("inner", "stage")],
    });
    const sdcpn = net({ subnets: [stage, fast, line] });

    expect(checkInterfaces(sdcpn)).toMatchObject([
      { subnetId: "line", instanceId: "inner", code: "unbound-instance" },
    ]);
    expect(
      checkInterfaces({ ...sdcpn, implementations: { stage: "fast" } }),
    ).toEqual([]);
  });
});

describe("a component that runs inside itself", () => {
  it("is reported on the instance that closes the loop, through a binding or not", () => {
    // The decorator shape: an implementation that wraps an instance of its
    // own interface, which the default then binds back to it.
    const wrapper = subnet("wrapper", {
      ...fast,
      id: "wrapper",
      name: "wrapper",
      componentInstances: [instance("inner", "stage")],
    });
    const sdcpn = net({
      subnets: [stage, fast, wrapper],
      implementations: { stage: "wrapper" },
    });

    const problems = checkInterfaces(sdcpn);
    expect(problems).toMatchObject([
      { subnetId: "wrapper", instanceId: "inner", code: "component-cycle" },
    ]);
    expect(problems[0]?.message).toContain("inner runs wrapper inside itself");
    expect(
      checkInterfaces({ ...sdcpn, implementations: { stage: "fast" } }),
    ).toEqual([]);

    const outer = subnet("outer", {
      componentInstances: [instance("o", "middle")],
    });
    const middle = subnet("middle", {
      componentInstances: [instance("m", "outer")],
    });
    expect(checkInterfaces(net({ subnets: [outer, middle] }))).toMatchObject([
      { subnetId: "outer", instanceId: "o", code: "component-cycle" },
      { subnetId: "middle", instanceId: "m", code: "component-cycle" },
    ]);
  });
});

describe("a fusion on a port of an interface", () => {
  it("is checked against the port of the implementation that runs", () => {
    const narrow = subnet("narrow", {
      implements: ["stage"],
      places: [
        place("narrow_in", { name: "In", isPort: true, capacity: 3 }),
        place("narrow_out", { name: "Out", isPort: true }),
      ],
      parameters: [parameter("narrow_rate", "rate")],
    });
    const sdcpn = net({
      places: [place("buffer", { capacity: 5 })],
      subnets: [stage, narrow],
      implementations: { stage: "narrow" },
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          members: [
            { kind: "place", placeId: "buffer" },
            {
              kind: "componentPort",
              componentInstanceId: "s1",
              portPlaceId: "stage_in",
            },
          ],
        },
      ],
    });

    const errors = (document: SDCPN) =>
      checkFusions(document).filter(({ severity }) => severity === "error");

    expect(errors(sdcpn)).toMatchObject([
      { fusionId: "f1", code: "capacity-mismatch" },
    ]);
    // Unbound, the interface's own port is all there is to check.
    expect(errors({ ...sdcpn, implementations: undefined })).toEqual([]);
  });
});

describe("resolveImplementation", () => {
  it("prefers the instance's choice over the document's default", () => {
    const slow = { ...fast, id: "slow", name: "slow" };
    const sdcpn = net({
      subnets: [stage, fast, slow],
      implementations: { stage: "fast" },
    });

    expect(resolveImplementation(sdcpn, instance("s1", "stage"))).toMatchObject(
      { kind: "bound", implementation: { id: "fast" }, chosenBy: "document" },
    );
    expect(
      resolveImplementation(sdcpn, instance("s1", "stage", "slow")),
    ).toMatchObject({
      kind: "bound",
      implementation: { id: "slow" },
      chosenBy: "instance",
    });
    expect(resolveImplementation(sdcpn, instance("f1", "fast"))).toMatchObject({
      kind: "component",
      subnet: { id: "fast" },
    });
  });

  it("maps the interface's ports onto the implementation's by name", () => {
    expect([...mapInterfacePorts(stage, fast)]).toEqual([
      ["stage_in", "fast_in"],
      ["stage_out", "fast_out"],
    ]);
  });
});
