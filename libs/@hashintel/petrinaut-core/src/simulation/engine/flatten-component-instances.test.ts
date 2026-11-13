import { describe, expect, it } from "vitest";

import {
  flattenComponentInstancesForSimulation,
  getArcPlaceNameOverrideKey,
} from "./flatten-component-instances";

import type {
  ComponentInstance,
  DifferentialEquation,
  Parameter,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { ParameterValues } from "./types";

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
  overrides: Partial<Transition> = {},
): Transition => ({
  id,
  name: id,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
  ...overrides,
});

const parameter = (
  id: string,
  overrides: Partial<Parameter> = {},
): Parameter => ({
  id,
  name: id,
  variableName: id,
  type: "real",
  defaultValue: "0",
  ...overrides,
});

const componentInstance = (
  id: string,
  subnetId: string,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance => ({
  id,
  name: id,
  subnetId,
  parameterValues: {},
  x: 0,
  y: 0,
  ...overrides,
});

const subnet = (id: string, overrides: Partial<Subnet> = {}): Subnet => ({
  id,
  name: id,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
  ...overrides,
});

const sdcpn = (overrides: Partial<SDCPN> = {}): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const flatten = ({
  definition,
  initialMarking = {},
  rootParameterValues = {},
  parametersEnabled = true,
}: {
  definition: SDCPN;
  initialMarking?: InitialMarking;
  rootParameterValues?: ParameterValues;
  parametersEnabled?: boolean;
}) =>
  flattenComponentInstancesForSimulation({
    sdcpn: definition,
    initialMarking,
    rootParameterValues,
    parametersEnabled,
  });

describe("flattenComponentInstancesForSimulation", () => {
  it("returns the source definition when there are no component instances or component-port arcs", () => {
    const rootParameterValues = { rate: 2 };
    const definition = sdcpn({
      places: [place("root")],
      transitions: [transition("tick")],
    });

    const result = flatten({
      definition,
      initialMarking: { root: 3 },
      rootParameterValues,
    });

    expect(result.sdcpn).toBe(definition);
    expect(result.initialMarking).toEqual({ root: 3 });
    expect(result.placeParameterValues.get("root")).toBe(rootParameterValues);
    expect(result.transitionParameterValues.get("tick")).toBe(
      rootParameterValues,
    );
    expect(result.arcPlaceNameOverrides.size).toBe(0);
  });

  it("flattens a component instance and rewrites component-port arcs to the scoped port place", () => {
    const color = {
      id: "token",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#ff0000",
      elements: [{ elementId: "x", name: "x", type: "real" as const }],
    };
    const equation: DifferentialEquation = {
      id: "flow",
      name: "Flow",
      colorId: "token",
      code: "export default Dynamics((token) => ({}));",
      arity: 1,
    };
    const pairwise: DifferentialEquation = {
      id: "pull",
      name: "Pull",
      colorId: "token",
      code: "return [{ x: 1 }, { x: -1 }];",
      arity: 2,
    };
    const definition = sdcpn({
      places: [place("root")],
      transitions: [
        transition("send", {
          inputArcs: [{ placeId: "root", weight: 1, type: "standard" }],
          outputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "worker",
                portPlaceId: "port-in",
              },
              weight: 2,
            },
          ],
        }),
      ],
      componentInstances: [
        componentInstance("worker", "processor", { name: "Worker" }),
      ],
      subnets: [
        subnet("processor", {
          types: [color],
          differentialEquations: [equation, pairwise],
          places: [
            place("port-in", {
              name: "Port In",
              isPort: true,
              colorId: "token",
              dynamicsEnabled: true,
              dynamics: [
                { differentialEquationId: "flow" },
                { differentialEquationId: "pull" },
              ],
            }),
          ],
          transitions: [
            transition("process", {
              inputArcs: [{ placeId: "port-in", weight: 1, type: "standard" }],
            }),
          ],
        }),
      ],
    });

    const result = flatten({
      definition,
      initialMarking: { root: 1 },
    });

    expect(result.sdcpn.componentInstances).toEqual([]);
    expect(result.sdcpn.subnets).toEqual([]);
    expect(result.sdcpn.types.map(({ id }) => id)).toEqual(["worker::token"]);
    expect(result.sdcpn.differentialEquations).toMatchObject([
      { id: "worker::flow", colorId: "worker::token" },
      { id: "worker::pull", colorId: "worker::token", arity: 2 },
    ]);
    expect(result.sdcpn.places).toMatchObject([
      { id: "root" },
      {
        id: "worker::port-in",
        colorId: "worker::token",
        dynamics: [
          { differentialEquationId: "worker::flow" },
          { differentialEquationId: "worker::pull" },
        ],
      },
    ]);
    expect(result.sdcpn.places[0]).not.toHaveProperty("dynamics");
    expect(result.sdcpn.transitions).toMatchObject([
      {
        id: "send",
        outputArcs: [{ placeId: "worker::port-in", weight: 2 }],
      },
      {
        id: "worker::process",
        inputArcs: [
          { placeId: "worker::port-in", weight: 1, type: "standard" },
        ],
      },
    ]);
    expect(
      result.arcPlaceNameOverrides.get(
        getArcPlaceNameOverrideKey({
          transitionId: "send",
          placeId: "worker::port-in",
        }),
      ),
    ).toBe("Worker::Port In");
  });

  it("flattens multiple instances of the same subnet with distinct parameter values", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("fast", "worker", {
          parameterValues: { rate: "5", enabled: "false" },
        }),
        componentInstance("slow", "worker"),
      ],
      subnets: [
        subnet("worker", {
          places: [place("slot")],
          transitions: [transition("tick")],
          parameters: [
            parameter("rate", {
              variableName: "rate",
              defaultValue: "3",
            }),
            parameter("enabled", {
              variableName: "enabled",
              type: "boolean",
              defaultValue: "true",
            }),
          ],
        }),
      ],
    });

    const result = flatten({ definition });

    expect(result.sdcpn.places.map(({ id }) => id).sort()).toEqual([
      "fast::slot",
      "slow::slot",
    ]);
    expect(result.sdcpn.transitions.map(({ id }) => id).sort()).toEqual([
      "fast::tick",
      "slow::tick",
    ]);
    expect(result.sdcpn.parameters.map(({ id }) => id).sort()).toEqual([
      "fast::enabled",
      "fast::rate",
      "slow::enabled",
      "slow::rate",
    ]);
    expect(result.placeParameterValues.get("fast::slot")).toEqual({
      rate: 5,
      enabled: false,
    });
    expect(result.transitionParameterValues.get("fast::tick")).toEqual({
      rate: 5,
      enabled: false,
    });
    expect(result.placeParameterValues.get("slow::slot")).toEqual({
      rate: 3,
      enabled: true,
    });
  });

  it("flattens nested component instances into nested scoped IDs", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("outer", "outer-subnet")],
      subnets: [
        subnet("outer-subnet", {
          places: [place("outer-place")],
          componentInstances: [componentInstance("inner", "inner-subnet")],
        }),
        subnet("inner-subnet", {
          places: [place("leaf")],
          transitions: [transition("leaf-transition")],
        }),
      ],
    });

    const result = flatten({ definition });

    expect(result.sdcpn.places.map(({ id }) => id).sort()).toEqual([
      "outer::inner::leaf",
      "outer::outer-place",
    ]);
    expect(result.sdcpn.transitions.map(({ id }) => id)).toEqual([
      "outer::inner::leaf-transition",
    ]);
  });

  it("throws when an instance references a missing subnet", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("missing", "missing-subnet")],
    });

    expect(() => flatten({ definition })).toThrow(
      "references subnet ID `missing-subnet` which does not exist",
    );
  });

  it("throws when a component-port arc references a missing component instance", () => {
    const definition = sdcpn({
      transitions: [
        transition("send", {
          outputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "missing-instance",
                portPlaceId: "port",
              },
              weight: 1,
            },
          ],
        }),
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      "component instance ID `missing-instance`",
    );
  });

  it("throws when a component-port arc references a missing subnet port", () => {
    const definition = sdcpn({
      transitions: [
        transition("send", {
          outputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "worker",
                portPlaceId: "missing-port",
              },
              weight: 1,
            },
          ],
        }),
      ],
      componentInstances: [componentInstance("worker", "worker-subnet")],
      subnets: [subnet("worker-subnet", { places: [place("port")] })],
    });

    expect(() => flatten({ definition })).toThrow(
      "port place ID `missing-port`",
    );
  });

  it("throws when a component-port arc references a non-port place", () => {
    const definition = sdcpn({
      transitions: [
        transition("send", {
          outputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "worker",
                portPlaceId: "internal",
              },
              weight: 1,
            },
          ],
        }),
      ],
      componentInstances: [componentInstance("worker", "worker-subnet")],
      subnets: [subnet("worker-subnet", { places: [place("internal")] })],
    });

    expect(() => flatten({ definition })).toThrow(
      "only places marked `isPort` can be used as component ports",
    );
  });

  it("throws when subnet references form a cycle", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("outer", "outer-subnet")],
      subnets: [
        subnet("outer-subnet", {
          componentInstances: [componentInstance("inner", "inner-subnet")],
        }),
        subnet("inner-subnet", {
          componentInstances: [componentInstance("again", "outer-subnet")],
        }),
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      "Component subnet cycle detected: outer-subnet -> inner-subnet -> outer-subnet",
    );
  });

  it("throws when IDs contain the component scope separator", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("worker::one", "worker-subnet")],
      subnets: [subnet("worker-subnet", { places: [place("slot")] })],
    });

    expect(() => flatten({ definition })).toThrow("scope separator `::`");
  });

  it("throws when duplicate component instance IDs produce duplicate flattened IDs", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("worker", "worker-subnet"),
        componentInstance("worker", "worker-subnet"),
      ],
      subnets: [subnet("worker-subnet", { places: [place("slot")] })],
    });

    expect(() => flatten({ definition })).toThrow(
      "duplicate places ID `worker::slot`",
    );
  });
});

describe("flattenComponentInstancesForSimulation with fusions", () => {
  const machine = () =>
    subnet("machine", {
      places: [
        place("in", { name: "In", isPort: true }),
        place("out", { name: "Out", isPort: true }),
      ],
      transitions: [
        transition("work", {
          inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "out", weight: 1 }],
        }),
      ],
    });

  it("fuses a root place with an instance port, keeping the root place", () => {
    const definition = sdcpn({
      places: [place("buffer", { name: "Buffer" })],
      transitions: [
        transition("feed", {
          outputArcs: [{ placeId: "buffer", weight: 1 }],
        }),
      ],
      componentInstances: [componentInstance("m1", "machine")],
      subnets: [machine()],
      fusions: [
        {
          id: "f1",
          members: [
            { kind: "place", placeId: "buffer" },
            {
              kind: "componentPort",
              componentInstanceId: "m1",
              portPlaceId: "in",
            },
          ],
        },
      ],
    });

    const result = flatten({ definition, initialMarking: { buffer: 2 } });

    expect(result.sdcpn.places.map(({ id }) => id)).toEqual([
      "buffer",
      "m1::out",
    ]);
    expect(
      result.sdcpn.transitions.find(({ id }) => id === "m1::work")!.inputArcs,
    ).toEqual([{ placeId: "buffer", weight: 1, type: "standard" }]);
    expect(result.initialMarking).toEqual({ buffer: 2 });
    expect(result.placeParameterValues.has("m1::in")).toBe(false);
  });

  it("fuses two instance ports into one shared place", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("m1", "machine"),
        componentInstance("m2", "machine"),
      ],
      subnets: [machine()],
      fusions: [
        {
          id: "f1",
          name: "Conveyor",
          members: [
            {
              kind: "componentPort",
              componentInstanceId: "m1",
              portPlaceId: "out",
            },
            {
              kind: "componentPort",
              componentInstanceId: "m2",
              portPlaceId: "in",
            },
          ],
        },
      ],
    });

    const result = flatten({ definition });

    expect(result.sdcpn.places.map(({ id, name }) => [id, name])).toEqual([
      ["m1::in", "In"],
      ["m1::out", "Conveyor"],
      ["m2::out", "Out"],
    ]);
    expect(
      result.sdcpn.transitions.find(({ id }) => id === "m2::work")!.inputArcs,
    ).toEqual([{ placeId: "m1::out", weight: 1, type: "standard" }]);
  });

  it("applies fusions declared inside a subnet to the nested instances", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("line", "line")],
      subnets: [
        machine(),
        subnet("line", {
          places: [place("feed", { name: "Feed", isPort: true })],
          componentInstances: [componentInstance("m1", "machine")],
          fusions: [
            {
              id: "f1",
              members: [
                { kind: "place", placeId: "feed" },
                {
                  kind: "componentPort",
                  componentInstanceId: "m1",
                  portPlaceId: "in",
                },
              ],
            },
          ],
        }),
      ],
    });

    const result = flatten({ definition });

    expect(result.sdcpn.places.map(({ id }) => id)).toEqual([
      "line::feed",
      "line::m1::out",
    ]);
    expect(
      result.sdcpn.transitions.find(({ id }) => id === "line::m1::work")!
        .inputArcs[0]!.placeId,
    ).toBe("line::feed");
  });

  it("rejects a fusion member that is not a port", () => {
    const definition = sdcpn({
      places: [place("buffer")],
      componentInstances: [componentInstance("m1", "machine")],
      subnets: [
        subnet("machine", { places: [place("hidden", { isPort: false })] }),
      ],
      fusions: [
        {
          id: "f1",
          members: [
            { kind: "place", placeId: "buffer" },
            {
              kind: "componentPort",
              componentInstanceId: "m1",
              portPlaceId: "hidden",
            },
          ],
        },
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      /Fusion `f1` references subnet place `hidden`, but only places marked `isPort`/,
    );
  });

  it("rejects a fusion that holds two places of its net", () => {
    const definition = sdcpn({
      places: [place("first"), place("second")],
      fusions: [
        {
          id: "f1",
          members: [
            { kind: "place", placeId: "first" },
            { kind: "place", placeId: "second" },
          ],
        },
      ],
      // An instance, so flattening does not take its shortcut.
      componentInstances: [componentInstance("m1", "machine")],
      subnets: [machine()],
    });

    expect(() => flatten({ definition })).toThrow(
      /Fusion `f1` holds more than one place of its net/,
    );
  });

  it("keeps the name of an anchor inside a subnet, whatever its fusion is called", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("line", "line")],
      subnets: [
        machine(),
        subnet("line", {
          places: [place("feed", { name: "Feed" })],
          componentInstances: [componentInstance("m1", "machine")],
          fusions: [
            {
              id: "f1",
              name: "Belt",
              members: [
                { kind: "place", placeId: "feed" },
                {
                  kind: "componentPort",
                  componentInstanceId: "m1",
                  portPlaceId: "in",
                },
              ],
            },
          ],
        }),
      ],
    });

    const result = flatten({ definition });

    expect(
      result.sdcpn.places.find(({ id }) => id === "line::feed"),
    ).toMatchObject({ name: "Feed" });
  });

  describe("dynamics on a fused port", () => {
    /** A bath whose port cools at the bath's own rate. */
    const bath = () =>
      subnet("bath", {
        types: [
          {
            id: "part",
            name: "Part",
            iconSlug: "circle",
            displayColor: "#000",
            elements: [{ elementId: "t", name: "temperature", type: "real" }],
          },
        ],
        differentialEquations: [
          { id: "cool", name: "Cool", colorId: "part", code: "", arity: 1 },
        ],
        parameters: [parameter("rate", { defaultValue: "2" })],
        places: [
          place("pool", {
            name: "Pool",
            isPort: true,
            colorId: "part",
            dynamicsEnabled: true,
            dynamics: [{ differentialEquationId: "cool" }],
          }),
        ],
      });
    const poolOf = (instanceId: string) => ({
      kind: "componentPort" as const,
      componentInstanceId: instanceId,
      portPlaceId: "pool",
    });

    it("runs a port's equations on the root place fused with it, with the instance's parameter values", () => {
      const definition = sdcpn({
        types: [
          {
            id: "part",
            name: "Part",
            iconSlug: "circle",
            displayColor: "#000",
            elements: [{ elementId: "t", name: "temperature", type: "real" }],
          },
        ],
        places: [place("tank", { name: "Tank", colorId: "part" })],
        componentInstances: [
          componentInstance("b1", "bath", { parameterValues: { rate: "5" } }),
        ],
        subnets: [bath()],
        fusions: [
          {
            id: "f1",
            members: [{ kind: "place", placeId: "tank" }, poolOf("b1")],
          },
        ],
      });

      const result = flatten({
        definition,
        rootParameterValues: { rate: 99 },
      });

      expect(result.sdcpn.places.find(({ id }) => id === "tank")).toMatchObject(
        {
          dynamicsEnabled: true,
          dynamics: [{ differentialEquationId: "b1::cool" }],
        },
      );
      expect(result.placeParameterValues.get("tank")).toEqual({ rate: 5 });
    });

    it("lets two instances of one component share a fused port that runs dynamics", () => {
      const definition = sdcpn({
        componentInstances: [
          componentInstance("b1", "bath"),
          componentInstance("b2", "bath"),
        ],
        subnets: [bath()],
        fusions: [{ id: "f1", members: [poolOf("b1"), poolOf("b2")] }],
      });

      const result = flatten({ definition });

      expect(result.sdcpn.places).toMatchObject([
        { id: "b1::pool", dynamics: [{ differentialEquationId: "b1::cool" }] },
      ]);
    });
  });
});
