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
  differentialEquationId: null,
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
      code: "export default Dynamics(() => []);",
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
          differentialEquations: [equation],
          places: [
            place("port-in", {
              name: "Port In",
              isPort: true,
              colorId: "token",
              dynamicsEnabled: true,
              differentialEquationId: "flow",
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
    ]);
    expect(result.sdcpn.places).toMatchObject([
      { id: "root" },
      {
        id: "worker::port-in",
        colorId: "worker::token",
        differentialEquationId: "worker::flow",
      },
    ]);
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
    ).toBe("Worker_Port_In");
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
