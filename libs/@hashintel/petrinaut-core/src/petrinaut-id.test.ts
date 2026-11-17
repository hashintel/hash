import { describe, expect, it } from "vitest";

import { generateArcId } from "./arc-id";
import {
  canonicalizeArcId,
  canonicalizePetrinautIds,
  generatePetrinautId,
  isPetrinautId,
  toPetrinautId,
} from "./petrinaut-id";

import type { Component, ComponentInstance, SDCPN } from "./types/sdcpn";

const emptyNet = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
} satisfies SDCPN;

const instance = (id: string, componentId: string): ComponentInstance => ({
  id,
  name: id,
  component: { id: componentId },
  parameterValues: {},
  x: 0,
  y: 0,
});

const component = (
  id: string,
  componentInstances?: ComponentInstance[],
): Component => ({
  ...emptyNet,
  id,
  name: id,
  ...(componentInstances && { componentInstances }),
});

describe("isPetrinautId", () => {
  it("accepts a lowercase UUID only", () => {
    expect(isPetrinautId("56c16f29-0b95-5de8-992d-54db5288e8c4")).toBe(true);
    expect(isPetrinautId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(false);
    expect(isPetrinautId("net-1")).toBe(false);
    expect(isPetrinautId(42)).toBe(false);
  });
});

describe("toPetrinautId", () => {
  it("lowercases a UUID", () => {
    expect(toPetrinautId("56C16F29-0B95-5DE8-992D-54DB5288E8C4")).toBe(
      "56c16f29-0b95-5de8-992d-54db5288e8c4",
    );
  });

  it("maps any other id to a fixed UUIDv5", () => {
    expect(toPetrinautId("net-1")).toBe("56c16f29-0b95-5de8-992d-54db5288e8c4");
    expect(toPetrinautId("component-1")).toBe(
      "5f244808-891b-52c8-b3ce-a179de9ebca1",
    );
  });

  it("is idempotent", () => {
    for (const id of ["net-1", "component__x", "", generatePetrinautId()]) {
      expect(toPetrinautId(toPetrinautId(id))).toBe(toPetrinautId(id));
      expect(isPetrinautId(toPetrinautId(id))).toBe(true);
    }
  });
});

describe("generatePetrinautId", () => {
  it("returns a fresh Petrinaut id on each call", () => {
    const first = generatePetrinautId();
    const second = generatePetrinautId();
    expect(isPetrinautId(first)).toBe(true);
    expect(first).not.toBe(second);
  });
});

const idOf = toPetrinautId;
const value = (expression: string) => ({ expression, optimize: null });
const tokenUuid = "7f1d8c2e-5b8a-4c3d-9e1f-2a3b4c5d6e7f";

const legacyNet = (): SDCPN => ({
  types: [
    {
      id: "colour",
      name: "Colour",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "weight", name: "weight", type: "real" },
        { elementId: "tag", name: "tag", type: "uuid" },
      ],
    },
  ],
  differentialEquations: [
    {
      id: "decay",
      name: "Decay",
      colorId: "colour",
      code: "return { weight: 0 };",
      arity: 1,
    },
    {
      id: "drift",
      name: "Drift",
      colorId: "colour",
      code: "return { weight: 1 };",
      arity: 1,
    },
  ],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    },
  ],
  places: [
    {
      id: "waiting",
      name: "Waiting",
      colorId: "colour",
      dynamicsEnabled: true,
      dynamics: [
        { differentialEquationId: "decay" },
        { differentialEquationId: "drift" },
      ],
      x: 0,
      y: 0,
    },
    {
      id: "done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "serve",
      name: "Serve",
      metadata: { source: "waiting" },
      inputArcs: [{ placeId: "waiting", weight: 1, type: "standard" }],
      outputArcs: [
        { endpoint: { kind: "place", placeId: "done" }, weight: 1 },
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "unit",
            portPlaceId: "port",
          },
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  components: [
    {
      ...emptyNet,
      id: "machine",
      name: "Machine",
      places: [
        {
          id: "port",
          name: "Port",
          colorId: null,
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      parameters: [
        {
          id: "speed",
          name: "Speed",
          variableName: "speed",
          type: "real",
          defaultValue: "1",
        },
      ],
    },
  ],
  componentInstances: [
    {
      id: "unit",
      name: "Unit",
      component: { id: "machine" },
      parameterValues: { speed: "2" },
      x: 0,
      y: 0,
    },
  ],
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      scenarioParameters: [{ type: "real", identifier: "load", default: 1 }],
      parameterOverrides: { rate: "scenario.load" },
      initialState: {
        type: "per_place",
        content: { waiting: [[1, tokenUuid]], done: "3" },
      },
    },
    {
      id: "coded",
      name: "Coded",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "code", content: "return { Waiting: 1 };" },
    },
    {
      id: "form",
      name: "Form",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: {
        type: "adhoc",
        content: {
          variables: [],
          netParameters: [{ ...value("1"), parameterId: "rate" }],
          places: {
            waiting: {
              kind: "coloured",
              variables: [],
              rows: [],
              sharedColumns: { weight: value("1") },
            },
          },
        },
      },
    },
  ],
  metrics: [{ id: "throughput", name: "Throughput", code: "return 1;" }],
});

describe("canonicalizePetrinautIds", () => {
  it("rewrites component definitions together with their references", () => {
    const sdcpn: SDCPN = {
      ...emptyNet,
      components: [
        component("outer", [instance("nested", "inner")]),
        component("inner"),
      ],
      componentInstances: [instance("root", "outer")],
    };

    const canonical = canonicalizePetrinautIds(sdcpn);

    expect(canonical.components?.map(({ id }) => id)).toEqual([
      toPetrinautId("outer"),
      toPetrinautId("inner"),
    ]);
    expect(
      canonical.components?.[0]?.componentInstances?.[0]?.component,
    ).toEqual({ id: toPetrinautId("inner") });
    expect(canonical.componentInstances?.[0]?.component).toEqual({
      id: toPetrinautId("outer"),
    });
    expect(canonical.components?.[1]).not.toHaveProperty("componentInstances");
    expect(sdcpn.components?.[0]?.id).toBe("outer");
  });

  const canonical = canonicalizePetrinautIds(legacyNet());

  it("converts every definition and every reference to it", () => {
    expect(canonical.types[0]).toMatchObject({
      id: idOf("colour"),
      name: "Colour",
      elements: [
        { elementId: idOf("weight"), name: "weight" },
        { elementId: idOf("tag"), name: "tag" },
      ],
    });
    expect(canonical.differentialEquations[0]).toMatchObject({
      id: idOf("decay"),
      colorId: idOf("colour"),
    });
    expect(canonical.parameters[0]?.id).toBe(idOf("rate"));
    expect(canonical.places[0]).toMatchObject({
      id: idOf("waiting"),
      colorId: idOf("colour"),
      dynamics: [
        { differentialEquationId: idOf("decay") },
        { differentialEquationId: idOf("drift") },
      ],
    });
    expect(canonical.places[1]).toMatchObject({
      id: idOf("done"),
      colorId: null,
    });
    expect(canonical.places[1]).not.toHaveProperty("dynamics");
    expect(canonical.transitions[0]).toMatchObject({
      id: idOf("serve"),
      inputArcs: [{ placeId: idOf("waiting") }],
      outputArcs: [
        { endpoint: { kind: "place", placeId: idOf("done") } },
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: idOf("unit"),
            portPlaceId: idOf("port"),
          },
        },
      ],
    });
    expect(canonical.components?.[0]).toMatchObject({
      id: idOf("machine"),
      places: [{ id: idOf("port") }],
      parameters: [{ id: idOf("speed") }],
    });
    expect(canonical.componentInstances?.[0]).toMatchObject({
      id: idOf("unit"),
      component: { id: idOf("machine") },
      parameterValues: { [idOf("speed")]: "2" },
    });
    expect(canonical.metrics?.[0]?.id).toBe(idOf("throughput"));
  });

  it("converts the scenario overrides and initial states keyed by id", () => {
    const [baseline, coded, form] = canonical.scenarios ?? [];
    expect(baseline).toMatchObject({
      id: idOf("baseline"),
      parameterOverrides: { [idOf("rate")]: "scenario.load" },
      initialState: {
        type: "per_place",
        content: { [idOf("waiting")]: [[1, tokenUuid]], [idOf("done")]: "3" },
      },
    });
    expect(coded?.initialState).toEqual({
      type: "code",
      content: "return { Waiting: 1 };",
    });
    expect(form?.initialState).toEqual({
      type: "adhoc",
      content: {
        variables: [],
        netParameters: [{ ...value("1"), parameterId: idOf("rate") }],
        places: {
          [idOf("waiting")]: {
            kind: "coloured",
            variables: [],
            rows: [],
            sharedColumns: { weight: value("1") },
          },
        },
      },
    });
  });

  it("leaves names, metadata and scenario parameter identifiers alone", () => {
    expect(canonical.places.map(({ name }) => name)).toEqual([
      "Waiting",
      "Done",
    ]);
    expect(canonical.transitions[0]?.metadata).toEqual({ source: "waiting" });
    expect(canonical.scenarios?.[0]?.scenarioParameters).toEqual([
      { type: "real", identifier: "load", default: 1 },
    ]);
  });

  it("keeps an import's id and what names a component of an import as written", () => {
    const scale = { from: "@hashintel/logistics", id: "scale" };
    const net = canonicalizePetrinautIds({
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      imports: [{ id: "@hashintel/logistics" }],
      componentInstances: [
        {
          id: "scale-1",
          name: "ScaleA",
          component: scale,
          parameterValues: { rate: "2" },
          implementation: { from: "@hashintel/logistics", id: "belt" },
          x: 0,
          y: 0,
        },
      ],
      implementations: [{ interface: scale, component: { id: "own-scale" } }],
    });

    expect(net.imports).toEqual([{ id: "@hashintel/logistics" }]);
    expect(net.componentInstances[0]).toMatchObject({
      id: idOf("scale-1"),
      component: scale,
      parameterValues: { [idOf("rate")]: "2" },
      implementation: { from: "@hashintel/logistics", id: "belt" },
    });
    expect(net.implementations).toEqual([
      { interface: scale, component: { id: idOf("own-scale") } },
    ]);
  });

  it("is idempotent and keeps a canonical net by reference", () => {
    expect(canonicalizePetrinautIds(canonical)).toBe(canonical);
    expect(canonicalizePetrinautIds(emptyNet)).toBe(emptyNet);
  });
});

describe("canonicalizeArcId", () => {
  it("converts the ids inside a place-to-transition arc id", () => {
    expect(
      canonicalizeArcId(
        generateArcId({ inputId: "place:waiting", outputId: "serve" }),
      ),
    ).toBe(
      generateArcId({
        inputId: `place:${idOf("waiting")}`,
        outputId: idOf("serve"),
      }),
    );
  });

  it("converts the ids inside a component port arc id", () => {
    expect(
      canonicalizeArcId(
        generateArcId({
          inputId: "serve",
          outputId: "componentPort:unit:port",
        }),
      ),
    ).toBe(
      generateArcId({
        inputId: idOf("serve"),
        outputId: `componentPort:${idOf("unit")}:${idOf("port")}`,
      }),
    );
  });

  it("returns other strings unchanged and is idempotent", () => {
    expect(canonicalizeArcId("place-1")).toBe("place-1");
    const arcId = canonicalizeArcId(
      generateArcId({ inputId: "place:waiting", outputId: "serve" }),
    );
    expect(canonicalizeArcId(arcId)).toBe(arcId);
  });
});
