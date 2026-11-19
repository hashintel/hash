import { describe, expect, it } from "vitest";

import { checkFusions } from "./check-fusions";
import { checkInterfaces, implementationsOf } from "./check-interfaces";
import {
  describeUnboundInstance,
  indexSubnet,
  mapInterfacePorts,
  resolveImplementation,
} from "./interfaces";
import { resolveLibrary } from "./libraries";
import { logistics } from "./libraries.test-helpers";

import type {
  Color,
  DefaultImplementation,
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
  ...(implementation === undefined
    ? {}
    : { implementation: { id: implementation } }),
});

/** The document's default implementation for an interface. */
const defaultOf = (
  interfaceId: string,
  componentId: string,
): DefaultImplementation => ({
  interface: { id: interfaceId },
  component: { id: componentId },
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

  it("reports an interface that implements an interface, once, as an error on it", () => {
    const draft = subnet("draft", {
      interface: true,
      // Neither is held against it: the one problem is that it implements at all.
      implements: ["stage", "ghost"],
    });

    expect(checkInterfaces(net({ subnets: [stage, draft] }))).toMatchObject([
      { subnetId: "draft", code: "interface-implements", severity: "error" },
    ]);
  });

  it("reports implementing something that is not an interface", () => {
    const other = subnet("other");
    const wrong = subnet("wrong", { implements: ["other", "ghost"] });

    expect(
      checkInterfaces(net({ subnets: [other, wrong] })).map(({ code }) => code),
    ).toEqual(["unknown-interface", "unknown-interface"]);
  });

  it("checks an interface once, however often a subnet says it implements it", () => {
    const bare = subnet("bare", {
      implements: ["stage", "ghost", "stage", "ghost"],
    });

    expect(
      checkInterfaces(net({ subnets: [stage, bare] })).map(({ code }) => code),
    ).toEqual([
      "missing-port",
      "missing-port",
      "missing-parameter",
      "unknown-interface",
    ]);
  });

  it("holds each of two subnets with one id to its own ports and parameters", () => {
    const lacking = subnet("fast", { implements: ["stage"] });

    expect(
      checkInterfaces(net({ subnets: [stage, fast, lacking] })).map(
        ({ code }) => code,
      ),
    ).toEqual(["missing-port", "missing-port", "missing-parameter"]);
  });

  it("reports an instance of an interface with nothing bound, and accepts a document default or an instance choice", () => {
    const unbound = net({
      subnets: [stage, fast],
      componentInstances: [instance("s1", "stage")],
    });
    expect(checkInterfaces(unbound)).toMatchObject([
      { subnetId: null, instanceId: "s1", code: "unbound-instance" },
    ]);

    const byDefault = {
      ...unbound,
      implementations: [defaultOf("stage", "fast")],
    };
    expect(checkInterfaces(byDefault)).toEqual([]);

    const byInstance = net({
      subnets: [stage, fast],
      componentInstances: [instance("s1", "stage", "fast")],
    });
    expect(checkInterfaces(byInstance)).toEqual([]);
  });

  it("reports two defaults for one interface, once, and runs the first", () => {
    const slow = { ...fast, id: "slow", name: "slow" };
    const sdcpn = net({
      subnets: [stage, fast, slow],
      componentInstances: [instance("s1", "stage")],
      implementations: [
        defaultOf("stage", "fast"),
        defaultOf("stage", "slow"),
        defaultOf("stage", "fast"),
        defaultOf("ghost", "fast"),
        defaultOf("ghost", "slow"),
      ],
    });

    expect(checkInterfaces(sdcpn)).toMatchObject([
      { subnetId: "stage", code: "duplicate-default", severity: "error" },
      { subnetId: null, code: "duplicate-default", severity: "error" },
    ]);
    expect(resolveImplementation(sdcpn, instance("s1", "stage"))).toMatchObject(
      { kind: "bound", implementation: { id: "fast" } },
    );
  });

  it("counts the defaults of a long list in one pass", () => {
    const size = 40_000;
    const sdcpn = net({
      subnets: [stage, fast],
      implementations: Array.from({ length: size }, () =>
        defaultOf("stage", "fast"),
      ),
    });

    const started = Date.now();
    const problems = checkInterfaces(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toMatchObject([
      { subnetId: "stage", code: "duplicate-default" },
    ]);
    expect(problems[0]?.message).toContain(`${size} default implementations`);
    // One pass takes milliseconds; a search of the list for every entry
    // takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
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
      checkInterfaces({
        ...sdcpn,
        implementations: [defaultOf("stage", "fast")],
      }),
    ).toEqual([]);
  });

  it("checks many instances against a long list of defaults, with one read of the list", () => {
    const size = 50_000;
    const sdcpn = net({
      subnets: [stage, fast],
      componentInstances: Array.from({ length: size }, (_, index) =>
        instance(`s${index}`, "stage"),
      ),
      implementations: [
        ...Array.from({ length: size }, (_, index) =>
          defaultOf(`other${index}`, "fast"),
        ),
        defaultOf("stage", "fast"),
        // Of two entries for one interface the first applies.
        defaultOf("stage", "gone"),
      ],
    });

    const started = Date.now();
    expect(checkInterfaces(sdcpn)).toMatchObject([
      { code: "duplicate-default" },
    ]);
    // One read of the list takes milliseconds; a search of it for every
    // instance takes several seconds.
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("an implementation bound across a library", () => {
  const libraries = new Map([
    [logistics.id, resolveLibrary(logistics.id, logistics)],
  ]);
  /** An instance of the library's interface that runs a subnet of the document. */
  const scaleRunning = (id: string, implementation: string) => ({
    id,
    name: id,
    component: { from: logistics.id, id: "scale" },
    implementation: { id: implementation },
    parameterValues: {},
    x: 0,
    y: 0,
  });

  it("is held to the interface once for the instances bound alike, however many", () => {
    // In and Out declare no direction, under 20,000 arcs that give them one.
    const wide = subnet("wide", {
      places: [
        place("wide_in", { name: "In", isPort: true }),
        place("wide_out", { name: "Out", isPort: true }),
      ],
      transitions: Array.from({ length: 10_000 }, (_, index) =>
        transition(`move-${index}`, ["wide_in"], ["wide_out"]),
      ),
      parameters: [parameter("wide_rate", "rate")],
    });
    const sdcpn = net({
      subnets: [wide],
      componentInstances: Array.from({ length: 2000 }, (_, index) =>
        scaleRunning(`s${index}`, "wide"),
      ),
    });

    const started = Date.now();
    const problems = checkInterfaces(sdcpn, libraries);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    // Reading the implementation's arcs for every instance takes seconds.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("reports what it falls short of on every instance bound to it", () => {
    const backwards = subnet("backwards", {
      places: [
        place("back_in", { name: "In", isPort: true, portDirection: "out" }),
        place("back_out", { name: "Out", isPort: true, portDirection: "out" }),
      ],
    });
    const sdcpn = net({
      subnets: [backwards],
      componentInstances: [
        scaleRunning("s1", "backwards"),
        scaleRunning("s2", "backwards"),
      ],
    });

    expect(
      checkInterfaces(sdcpn, libraries).map(({ instanceId, code }) => [
        instanceId,
        code,
      ]),
    ).toEqual([
      ["s1", "port-direction-mismatch"],
      ["s1", "missing-parameter"],
      ["s2", "port-direction-mismatch"],
      ["s2", "missing-parameter"],
    ]);
  });
});

describe("an implementation that lists many interfaces", () => {
  it("is read once for the instances bound to it, however many", () => {
    const size = 50_000;
    // The list names the interface last, after as many it does not have.
    const versatile = subnet("versatile", {
      ...fast,
      id: "versatile",
      implements: [
        ...Array.from({ length: size }, (_, index) => `other${index}`),
        "stage",
      ],
    });
    const sdcpn = net({
      subnets: [stage, versatile],
      componentInstances: Array.from({ length: size }, (_, index) =>
        instance(`s${index}`, "stage", "versatile"),
      ),
    });

    const started = Date.now();
    const codes = new Set(checkInterfaces(sdcpn).map(({ code }) => code));
    const elapsed = Date.now() - started;

    // Every instance is bound: what is reported is the interfaces the list
    // names that do not exist.
    expect(codes).toEqual(new Set(["unknown-interface"]));
    // A search of the list for every instance takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("has its ports and parameters read by name once, however many interfaces it is held to", () => {
    // Five thousand interfaces that declare nothing, and one implementation
    // of them all with ten thousand ports and as many parameters.
    const interfaces = Array.from({ length: 5_000 }, (_, index) =>
      subnet(`empty${index}`, { interface: true }),
    );
    const names = Array.from({ length: 10_000 }, (_, index) => `item-${index}`);
    const wide = subnet("wide", {
      implements: interfaces.map(({ id }) => id),
      places: names.map((name) => place(`port_${name}`, { isPort: true })),
      parameters: names.map((name) => parameter(`rate_${name}`, name)),
    });

    const started = Date.now();
    const problems = checkInterfaces(net({ subnets: [...interfaces, wide] }));
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    // A read of both lists for every interface takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("an implementation with many ports, token types and parameters", () => {
  const size = 20_000;
  const names = Array.from({ length: size }, (_, index) => `item-${index}`);
  /** A port for each name, of a token type of its own, and a parameter for each. */
  const wide = (id: string, overrides: Partial<Subnet>) =>
    subnet(id, {
      types: names.map((name) =>
        color(`${id}_type_${name}`, [
          { elementId: "w", name: "weight", type: "real" },
        ]),
      ),
      places: names.map((name) =>
        place(`${id}_${name}`, {
          name,
          isPort: true,
          colorId: `${id}_type_${name}`,
        }),
      ),
      parameters: names.map((name) => parameter(`${id}_rate_${name}`, name)),
      ...overrides,
    });

  it("is held to its interface with one read of each of its lists", () => {
    const sdcpn = net({
      subnets: [
        wide("stage", { interface: true }),
        wide("fast", { implements: ["stage"] }),
      ],
    });

    const started = Date.now();
    const problems = checkInterfaces(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    // A search of the implementation's places, types and parameters for each
    // of the interface's takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("is held to the first of two places, types or parameters with one id", () => {
    const twice = <Item>(items: Item[]): Item[] => [...items, ...items];
    const typed = subnet("typed", {
      interface: true,
      types: [color("t", [{ elementId: "w", name: "weight", type: "real" }])],
      places: [place("typed_in", { name: "In", isPort: true, colorId: "t" })],
      parameters: [parameter("typed_rate", "rate")],
    });
    const doubled = subnet("doubled", {
      implements: ["typed"],
      types: [
        color("t", [{ elementId: "w", name: "weight", type: "real" }]),
        color("t", [{ elementId: "n", name: "count", type: "integer" }]),
      ],
      places: twice([
        place("doubled_in", { name: "In", isPort: true, colorId: "t" }),
      ]),
      parameters: [
        parameter("doubled_rate", "rate"),
        parameter("doubled_rate", "rate", "boolean"),
      ],
    });

    expect(checkInterfaces(net({ subnets: [typed, doubled] }))).toEqual([]);
  });
});

describe("an interface with many token types and places that are not ports", () => {
  it("is read once, however many implementations are held to it", () => {
    const size = 10_000;
    const typed = subnet("typed", {
      interface: true,
      types: Array.from({ length: size }, (_, index) =>
        color(`type-${index}`, [
          { elementId: "w", name: "weight", type: "real" },
        ]),
      ),
      places: [
        ...Array.from({ length: size }, (_, index) => place(`note-${index}`)),
        place("typed_in", {
          name: "In",
          isPort: true,
          colorId: `type-${size - 1}`,
        }),
      ],
    });
    const implementations = Array.from({ length: 5_000 }, (_, index) =>
      subnet(`impl${index}`, {
        implements: ["typed"],
        types: [color("t", [{ elementId: "w", name: "weight", type: "real" }])],
        places: [
          place(`impl${index}_in`, { name: "In", isPort: true, colorId: "t" }),
        ],
      }),
    );

    const started = Date.now();
    const problems = checkInterfaces(
      net({ subnets: [typed, ...implementations] }),
    );
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    // A read of the interface's places and token types for every
    // implementation takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("the directions of an implementation's ports", () => {
  // A thousand ports that declare no direction, under 20,000 arcs that
  // consume from them.
  const names = Array.from({ length: 1000 }, (_, index) => `port-${index}`);
  const wide = (implemented: string[]) =>
    subnet("wide", {
      implements: implemented,
      places: names.map((name) => place(name, { isPort: true })),
      transitions: Array.from({ length: 20 }, (_, index) =>
        transition(`take-${index}`, names, []),
      ),
    });
  /** An interface that declares the given ports as inputs. */
  const inputs = (id: string, ports: string[]) =>
    subnet(id, {
      interface: true,
      places: ports.map((name) =>
        place(`${id}_${name}`, { name, isPort: true, portDirection: "in" }),
      ),
    });

  it("are read off its arcs once, however many ports its interface declares", () => {
    const sdcpn = net({
      subnets: [inputs("stage", names), wide(["stage"])],
    });

    const started = Date.now();
    const problems = checkInterfaces(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("are read off its arcs once, however many interfaces it implements", () => {
    const stages = names.map((name) => inputs(`stage_${name}`, [name]));
    const sdcpn = net({
      subnets: [...stages, wide(stages.map(({ id }) => id))],
    });

    const started = Date.now();
    const problems = checkInterfaces(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("are held against what each interface declares", () => {
    const outputs = subnet("outputs", {
      interface: true,
      places: [
        place("out_0", { name: "port-0", isPort: true, portDirection: "out" }),
      ],
    });
    const sdcpn = net({
      subnets: [inputs("stage", names), outputs, wide(["stage", "outputs"])],
    });

    expect(checkInterfaces(sdcpn)).toMatchObject([
      { subnetId: "wide", code: "port-direction-mismatch" },
    ]);
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
      implementations: [defaultOf("stage", "wrapper")],
    });

    const problems = checkInterfaces(sdcpn);
    expect(problems).toMatchObject([
      { subnetId: "wrapper", instanceId: "inner", code: "component-cycle" },
    ]);
    expect(problems[0]?.message).toContain("inner runs wrapper inside itself");
    expect(
      checkInterfaces({
        ...sdcpn,
        implementations: [defaultOf("stage", "fast")],
      }),
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

  it("is not reported on an instance outside the loop it leads into", () => {
    const holder = (id: string, ...held: string[]) =>
      subnet(id, {
        componentInstances: held.map((heldId) =>
          instance(`${id}_${heldId}`, heldId),
        ),
      });
    // Two loops, `a` with `b` and `c` with `d`, and `b` holding `c` between them.
    const sdcpn = net({
      subnets: [
        holder("entry", "a"),
        holder("a", "b"),
        holder("b", "a", "c"),
        holder("c", "d"),
        holder("d", "c"),
      ],
    });

    expect(
      checkInterfaces(sdcpn).map(({ instanceId, code }) => [instanceId, code]),
    ).toEqual([
      ["a_b", "component-cycle"],
      ["b_a", "component-cycle"],
      ["c_d", "component-cycle"],
      ["d_c", "component-cycle"],
    ]);
  });

  it("checks a long chain of components, each holding the next, in one pass", () => {
    const length = 2_000;
    const chain = Array.from({ length }, (_, index) =>
      subnet(`link${index}`, {
        componentInstances:
          index + 1 < length
            ? [instance(`holds${index + 1}`, `link${index + 1}`)]
            : [],
      }),
    );

    const started = Date.now();
    expect(checkInterfaces(net({ subnets: chain }))).toEqual([]);
    // One pass takes milliseconds; a walk restarted at every instance took
    // several seconds.
    expect(Date.now() - started).toBeLessThan(2_000);
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
      implementations: [defaultOf("stage", "narrow")],
      componentInstances: [instance("s1", "stage")],
      fusions: [
        {
          id: "f1",
          name: "F1",
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

  it("resolves what runs behind the fused ports once, however many are fused", () => {
    // Two thousand ports on the interface and on its implementation, every
    // one of five instances' fused, and the default that binds them last in
    // a long list.
    const names = Array.from({ length: 2000 }, (_, index) => `port-${index}`);
    const portsOf = (id: string) =>
      names.map((name) => place(`${id}_${name}`, { name, isPort: true }));
    const wideStage = subnet("wide_stage", {
      interface: true,
      places: portsOf("stage"),
    });
    const wide = subnet("wide", {
      implements: ["wide_stage"],
      places: portsOf("wide"),
    });
    const instances = ["s1", "s2", "s3", "s4", "s5"];
    const sdcpn = net({
      subnets: [wideStage, wide],
      implementations: [
        ...Array.from({ length: 20_000 }, (_, index) =>
          defaultOf(`other${index}`, "wide"),
        ),
        defaultOf("wide_stage", "wide"),
      ],
      componentInstances: instances.map((id) => instance(id, "wide_stage")),
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: instances.flatMap((componentInstanceId) =>
            names.map((name) => ({
              kind: "componentPort" as const,
              componentInstanceId,
              portPlaceId: `stage_${name}`,
            })),
          ),
        },
      ],
    });

    const started = Date.now();
    const problems = checkFusions(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("reads an implementation's places once, however many interfaces it runs behind", () => {
    // Two thousand interfaces of one port each, an instance of each fused at
    // that port, and one implementation of ten thousand ports behind them all.
    const count = 2_000;
    const interfaces = Array.from({ length: count }, (_, index) =>
      subnet(`narrow${index}`, {
        interface: true,
        places: [
          place(`narrow${index}_port`, { name: `port-${index}`, isPort: true }),
        ],
      }),
    );
    const wide = subnet("wide", {
      implements: interfaces.map(({ id }) => id),
      places: Array.from({ length: 10_000 }, (_, index) =>
        place(`port-${index}`, { isPort: true }),
      ),
    });
    const sdcpn = net({
      subnets: [...interfaces, wide],
      componentInstances: interfaces.map(({ id }, index) =>
        instance(`s${index}`, id, "wide"),
      ),
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: interfaces.map(({ id }, index) => ({
            kind: "componentPort" as const,
            componentInstanceId: `s${index}`,
            portPlaceId: `${id}_port`,
          })),
        },
      ],
    });

    const started = Date.now();
    const problems = checkFusions(sdcpn);
    const elapsed = Date.now() - started;

    expect(problems).toEqual([]);
    // A read of the implementation's places for every binding takes several
    // seconds.
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("resolveImplementation", () => {
  it("prefers the instance's choice over the document's default", () => {
    const slow = { ...fast, id: "slow", name: "slow" };
    const sdcpn = net({
      subnets: [stage, fast, slow],
      implementations: [defaultOf("stage", "fast")],
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
});

describe("mapInterfacePorts", () => {
  it("maps the interface's ports onto the implementation's by name", () => {
    expect([
      ...mapInterfacePorts(indexSubnet(stage), indexSubnet(fast)),
    ]).toEqual([
      ["stage_in", "fast_in"],
      ["stage_out", "fast_out"],
    ]);
  });

  it("maps a port onto the last of two of the implementation's with its name", () => {
    const twice = subnet("twice", {
      places: [
        place("first_in", { name: "In", isPort: true }),
        place("last_in", { name: "In", isPort: true }),
        place("inner", { name: "Out" }),
      ],
    });

    expect([
      ...mapInterfacePorts(indexSubnet(stage), indexSubnet(twice)),
    ]).toEqual([["stage_in", "last_in"]]);
  });
});

describe("implementationsOf", () => {
  it("leaves out an interface that says it implements another: it has no body to run", () => {
    const draft = subnet("draft", { interface: true, implements: ["stage"] });
    const sdcpn = net({ subnets: [stage, fast, draft] });

    expect(
      implementationsOf(sdcpn, { id: "stage" }).map(
        (candidate) => candidate.subnet.id,
      ),
    ).toEqual(["fast"]);
  });
});

describe("describeUnboundInstance", () => {
  const described = (sdcpn: SDCPN, held: ReturnType<typeof instance>) => {
    const binding = resolveImplementation(sdcpn, held);
    return binding?.kind === "unbound"
      ? describeUnboundInstance(binding, held.name)
      : undefined;
  };
  const stranger = subnet("stranger");
  const draft = subnet("draft", { interface: true });
  const subnets = [stage, stranger, draft];

  it("names the instance for a choice of its own that cannot run", () => {
    const sdcpn = net({
      subnets,
      implementations: [defaultOf("stage", "stranger")],
    });

    expect(described(sdcpn, instance("s1", "stage", "gone"))).toBe(
      "s1 names an implementation that does not exist.",
    );
    expect(described(sdcpn, instance("s1", "stage", "draft"))).toBe(
      "s1 names draft as its implementation, which is an interface itself.",
    );
    expect(described(sdcpn, instance("s1", "stage", "stranger"))).toBe(
      "s1 names stranger as its implementation, which does not implement stage.",
    );
  });

  it("names the document's default when the instance chooses none and the default cannot run", () => {
    const withDefault = (implementationId: string) =>
      described(
        net({
          subnets,
          implementations: [defaultOf("stage", implementationId)],
        }),
        instance("s1", "stage"),
      );
    const lead =
      "s1 chooses no implementation, and the document's default for stage";

    expect(withDefault("gone")).toBe(
      `${lead} names an implementation that does not exist.`,
    );
    expect(withDefault("draft")).toBe(
      `${lead} names draft as its implementation, which is an interface itself.`,
    );
    expect(withDefault("stranger")).toBe(
      `${lead} names stranger as its implementation, which does not implement stage.`,
    );
  });
});
