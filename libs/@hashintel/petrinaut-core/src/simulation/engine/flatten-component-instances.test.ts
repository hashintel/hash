import { describe, expect, it } from "vitest";

import {
  flattenComponentInstancesForSimulation,
  getArcPlaceNameOverrideKey,
} from "./flatten-component-instances";

import type {
  Color,
  Component,
  ComponentInstance,
  DifferentialEquation,
  Parameter,
  Place,
  SDCPN,
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
  componentId: string,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance => ({
  id,
  name: id,
  component: { id: componentId },
  parameterValues: {},
  x: 0,
  y: 0,
  ...overrides,
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
      components: [
        component("processor", {
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
    expect(result.sdcpn.components).toEqual([]);
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

  it("flattens multiple instances of the same component with distinct parameter values", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("fast", "worker", {
          parameterValues: { rate: "5", enabled: "false" },
        }),
        componentInstance("slow", "worker"),
      ],
      components: [
        component("worker", {
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
      componentInstances: [componentInstance("outer", "outer-component")],
      components: [
        component("outer-component", {
          places: [place("outer-place")],
          componentInstances: [componentInstance("inner", "inner-component")],
        }),
        component("inner-component", {
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

  it("throws when an instance references a missing component", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("missing", "missing-component")],
    });

    expect(() => flatten({ definition })).toThrow(
      "references component ID `missing-component` which does not exist",
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

  it("throws when a component-port arc references a missing component port", () => {
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
      componentInstances: [componentInstance("worker", "worker-component")],
      components: [component("worker-component", { places: [place("port")] })],
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
      componentInstances: [componentInstance("worker", "worker-component")],
      components: [
        component("worker-component", { places: [place("internal")] }),
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      "only places marked `isPort` can be used as component ports",
    );
  });

  it("throws when component references form a cycle", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("outer", "outer-component")],
      components: [
        component("outer-component", {
          componentInstances: [componentInstance("inner", "inner-component")],
        }),
        component("inner-component", {
          componentInstances: [componentInstance("again", "outer-component")],
        }),
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      "Component component cycle detected: `outer-component` -> `inner-component` -> `outer-component`",
    );
  });

  it("throws when IDs contain the component scope separator", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("worker::one", "worker-component"),
      ],
      components: [component("worker-component", { places: [place("slot")] })],
    });

    expect(() => flatten({ definition })).toThrow("scope separator `::`");
  });

  it("throws when duplicate component instance IDs produce duplicate flattened IDs", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("worker", "worker-component"),
        componentInstance("worker", "worker-component"),
      ],
      components: [component("worker-component", { places: [place("slot")] })],
    });

    expect(() => flatten({ definition })).toThrow(
      "duplicate places ID `worker::slot`",
    );
  });
});

describe("flattenComponentInstancesForSimulation with fusions", () => {
  const machine = () =>
    component("machine", {
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

  it("fuses a root place with an instance port, keeping the root place's id under the fusion's name", () => {
    const definition = sdcpn({
      places: [place("buffer", { name: "Buffer" })],
      transitions: [
        transition("feed", {
          outputArcs: [{ placeId: "buffer", weight: 1 }],
        }),
      ],
      componentInstances: [componentInstance("m1", "machine")],
      components: [machine()],
      fusions: [
        {
          id: "f1",
          name: "Belt",
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

    expect(result.sdcpn.places.map(({ id, name }) => [id, name])).toEqual([
      ["buffer", "Belt"],
      ["m1::out", "Out"],
    ]);
    expect(
      result.sdcpn.transitions.find(({ id }) => id === "m1::work")!.inputArcs,
    ).toEqual([{ placeId: "buffer", weight: 1, type: "standard" }]);
    expect(result.initialMarking).toEqual({ buffer: 2 });
    expect(result.placeParameterValues.has("m1::in")).toBe(false);
  });

  it("gives a fused place its anchor's marking over a merged port's, in either order", () => {
    const definition = sdcpn({
      places: [place("buffer")],
      componentInstances: [componentInstance("m1", "machine")],
      components: [machine()],
      fusions: [
        {
          id: "f1",
          name: "F1",
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
    const markingOf = (initialMarking: InitialMarking) =>
      flatten({ definition, initialMarking }).initialMarking;

    expect(markingOf({ "m1::in": 5, buffer: 3 })).toEqual({ buffer: 3 });
    expect(markingOf({ buffer: 3, "m1::in": 5 })).toEqual({ buffer: 3 });
    // Without one on the anchor, the port's marking is the fused place's.
    expect(markingOf({ "m1::in": 5 })).toEqual({ buffer: 5 });
  });

  it("fuses two instance ports into one shared place", () => {
    const definition = sdcpn({
      componentInstances: [
        componentInstance("m1", "machine"),
        componentInstance("m2", "machine"),
      ],
      components: [machine()],
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

  it("applies fusions declared inside a component to the nested instances", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("line", "line")],
      components: [
        machine(),
        component("line", {
          places: [place("feed", { name: "Feed", isPort: true })],
          componentInstances: [componentInstance("m1", "machine")],
          fusions: [
            {
              id: "f1",
              name: "F1",
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
      components: [
        component("machine", { places: [place("hidden", { isPort: false })] }),
      ],
      fusions: [
        {
          id: "f1",
          name: "F1",
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
      /Fusion `F1` references component place `hidden`, but only places marked `isPort`/,
    );
  });

  it("rejects a fusion that holds two places of its net", () => {
    const definition = sdcpn({
      places: [place("first"), place("second")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [
            { kind: "place", placeId: "first" },
            { kind: "place", placeId: "second" },
          ],
        },
      ],
      // An instance, so flattening does not take its shortcut.
      componentInstances: [componentInstance("m1", "machine")],
      components: [machine()],
    });

    expect(() => flatten({ definition })).toThrow(
      /Fusion `F1` holds more than one place of its net/,
    );
  });

  it("rejects a fusion of a net with no instance, which has nothing to take a shortcut past", () => {
    const definition = sdcpn({
      places: [place("first"), place("second")],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [
            { kind: "place", placeId: "first" },
            { kind: "place", placeId: "second" },
          ],
        },
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      /Fusion `F1` holds more than one place of its net/,
    );
  });

  it("rejects two fusions of one net that share a member", () => {
    const port = {
      kind: "componentPort" as const,
      componentInstanceId: "m1",
      portPlaceId: "in",
    };
    const definition = sdcpn({
      places: [place("first"), place("second")],
      componentInstances: [componentInstance("m1", "machine")],
      components: [machine()],
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "first" }, port],
        },
        {
          id: "f2",
          name: "F2",
          members: [{ kind: "place", placeId: "second" }, port],
        },
      ],
    });

    expect(() => flatten({ definition })).toThrow(
      /Fusion `F2` shares a member with another fusion of its net/,
    );
  });

  it("names an anchor inside a component after its fusion", () => {
    const definition = sdcpn({
      componentInstances: [componentInstance("line", "line")],
      components: [
        machine(),
        component("line", {
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
    ).toMatchObject({ name: "Belt" });
  });

  describe("dynamics on a fused port", () => {
    /** A bath whose port cools at the bath's own rate. */
    const bath = () =>
      component("bath", {
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
        components: [bath()],
        fusions: [
          {
            id: "f1",
            name: "F1",
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
        components: [bath()],
        fusions: [
          { id: "f1", name: "F1", members: [poolOf("b1"), poolOf("b2")] },
        ],
      });

      const result = flatten({ definition });

      expect(result.sdcpn.places).toMatchObject([
        { id: "b1::pool", dynamics: [{ differentialEquationId: "b1::cool" }] },
      ]);
    });

    it("refuses the ports of two components that each define an equation under one id", () => {
      const kiln: Component = {
        ...bath(),
        id: "kiln",
        name: "kiln",
        differentialEquations: [
          {
            id: "cool",
            name: "Cool",
            colorId: "part",
            code: "return { temperature: 1 };",
            arity: 1,
          },
        ],
      };
      const definition = sdcpn({
        componentInstances: [
          componentInstance("b1", "bath"),
          componentInstance("k1", "kiln"),
        ],
        components: [bath(), kiln],
        fusions: [
          { id: "f1", name: "F1", members: [poolOf("b1"), poolOf("k1")] },
        ],
      });

      expect(() => flatten({ definition })).toThrow(
        /Fusion `F1` joins places `Pool` and `Pool` that run different differential equations/,
      );
    });

    it("refuses a root place and a port whose component defines an equation under the id of the root's", () => {
      const definition = sdcpn({
        types: bath().types,
        differentialEquations: [
          {
            id: "cool",
            name: "Cool",
            colorId: "part",
            code: "return { temperature: 1 };",
            arity: 1,
          },
        ],
        places: [
          place("tank", {
            name: "Tank",
            colorId: "part",
            dynamicsEnabled: true,
            dynamics: [{ differentialEquationId: "cool" }],
          }),
        ],
        componentInstances: [componentInstance("b1", "bath")],
        components: [bath()],
        fusions: [
          {
            id: "f1",
            name: "F1",
            members: [{ kind: "place", placeId: "tank" }, poolOf("b1")],
          },
        ],
      });

      expect(() => flatten({ definition })).toThrow(
        /Fusion `F1` joins places `Tank` and `Pool` that run different differential equations/,
      );
    });
  });

  describe("interfaces", () => {
    /** A stage signature: In consumed, Out produced, a rate parameter. */
    const stage = component("stage", {
      interface: true,
      places: [
        place("stage_in", { name: "In", isPort: true, portDirection: "in" }),
        place("stage_out", { name: "Out", isPort: true, portDirection: "out" }),
      ],
      parameters: [parameter("stage_rate", { variableName: "rate" })],
    });

    /** An implementation of the stage, its ports and parameter under its own ids. */
    const implementation = (id: string) =>
      component(id, {
        implements: ["stage"],
        places: [
          place(`${id}_in`, { name: "In", isPort: true }),
          place(`${id}_out`, { name: "Out", isPort: true }),
        ],
        transitions: [
          transition(`${id}_work`, {
            inputArcs: [{ placeId: `${id}_in`, weight: 1, type: "standard" }],
            outputArcs: [{ placeId: `${id}_out`, weight: 1 }],
          }),
        ],
        parameters: [
          parameter(`${id}_rate`, { variableName: "rate", defaultValue: "1" }),
        ],
      });

    it("runs the document's default implementation for an instance of an interface", () => {
      const definition = sdcpn({
        transitions: [
          transition("feed", {
            outputArcs: [
              {
                endpoint: {
                  kind: "componentPort",
                  componentInstanceId: "s1",
                  portPlaceId: "stage_in",
                },
                weight: 1,
              },
            ],
          }),
        ],
        componentInstances: [componentInstance("s1", "stage")],
        components: [stage, implementation("fast")],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      const result = flatten({ definition });

      expect(result.sdcpn.components).toEqual([]);
      expect(result.sdcpn.places.map(({ id }) => id)).toEqual([
        "s1::fast_in",
        "s1::fast_out",
      ]);
      expect(result.sdcpn.transitions).toMatchObject([
        { id: "feed", outputArcs: [{ placeId: "s1::fast_in", weight: 1 }] },
        {
          id: "s1::fast_work",
          inputArcs: [{ placeId: "s1::fast_in", weight: 1, type: "standard" }],
        },
      ]);
    });

    it("lets an instance choose its implementation over the document's default", () => {
      const definition = sdcpn({
        componentInstances: [
          componentInstance("s1", "stage"),
          componentInstance("s2", "stage", { implementation: { id: "slow" } }),
        ],
        components: [stage, implementation("fast"), implementation("slow")],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      const result = flatten({ definition });

      expect(result.sdcpn.transitions.map(({ id }) => id)).toEqual([
        "s1::fast_work",
        "s2::slow_work",
      ]);
    });

    it("throws for an instance of an interface with nothing bound", () => {
      const definition = sdcpn({
        componentInstances: [componentInstance("s1", "stage")],
        components: [stage, implementation("fast")],
      });

      expect(() => flatten({ definition })).toThrow(/no implementation to run/);
    });

    it("fuses through an interface port onto the implementation's port of the same name", () => {
      const definition = sdcpn({
        places: [place("buffer")],
        componentInstances: [componentInstance("s1", "stage")],
        components: [stage, implementation("fast")],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
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

      const result = flatten({ definition });

      expect(result.sdcpn.places.map(({ id }) => id)).not.toContain(
        "s1::fast_in",
      );
      expect(
        result.sdcpn.transitions.find(({ id }) => id === "s1::fast_work")!
          .inputArcs,
      ).toEqual([{ placeId: "buffer", weight: 1, type: "standard" }]);
    });

    it("maps the interface's parameters onto the implementation's by variable name", () => {
      const definition = sdcpn({
        componentInstances: [
          componentInstance("s1", "stage", {
            parameterValues: { stage_rate: "5" },
          }),
        ],
        components: [stage, implementation("fast")],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      const result = flatten({ definition });

      expect(result.sdcpn.parameters.map(({ id }) => id)).toEqual([
        "s1::fast_rate",
      ]);
      expect(result.transitionParameterValues.get("s1::fast_work")).toEqual({
        rate: 5,
      });
    });

    it("runs an instance that sets no value at the interface's default, not the implementation's", () => {
      const definition = sdcpn({
        componentInstances: [componentInstance("s1", "stage")],
        components: [
          {
            ...stage,
            parameters: [
              parameter("stage_rate", {
                variableName: "rate",
                defaultValue: "5",
              }),
            ],
          },
          implementation("fast"),
        ],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      expect(
        flatten({ definition }).transitionParameterValues.get("s1::fast_work"),
      ).toEqual({ rate: 5 });
    });

    it("throws when the implementation's port holds another token type than the interface's", () => {
      const colour = (id: string, type: "real" | "integer") => ({
        id,
        name: id,
        iconSlug: "circle",
        displayColor: "#000",
        elements: [{ elementId: `${id}_x`, name: "x", type }],
      });
      const typed = (
        base: Component,
        colorId: string,
        type: "real" | "integer",
      ) =>
        component(base.id, {
          ...base,
          types: [colour(colorId, type)],
          places: base.places.map((port) => ({ ...port, colorId })),
        });
      const definition = sdcpn({
        componentInstances: [componentInstance("s1", "stage")],
        components: [
          typed(stage, "reals", "real"),
          typed(implementation("fast"), "integers", "integer"),
        ],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      expect(() => flatten({ definition })).toThrow(
        /`s1` cannot run `fast`: Port In of fast holds a different token type/,
      );
    });

    it("throws when an implementation runs inside itself, naming the components", () => {
      const nested = component("fast", {
        ...implementation("fast"),
        componentInstances: [componentInstance("again", "stage")],
      });
      const definition = sdcpn({
        componentInstances: [componentInstance("s1", "stage")],
        components: [stage, nested],
        implementations: [
          { interface: { id: "stage" }, component: { id: "fast" } },
        ],
      });

      expect(() => flatten({ definition })).toThrow(
        "Component component cycle detected: `fast` -> `fast`",
      );
    });

    it("throws when the implementation lacks a port of the interface", () => {
      const partial = component("partial", {
        implements: ["stage"],
        places: [place("partial_in", { name: "In", isPort: true })],
      });
      const definition = sdcpn({
        transitions: [
          transition("drain", {
            inputArcs: [
              {
                endpoint: {
                  kind: "componentPort",
                  componentInstanceId: "s1",
                  portPlaceId: "stage_out",
                },
                weight: 1,
                type: "standard",
              },
            ],
          }),
        ],
        componentInstances: [
          componentInstance("s1", "stage", {
            implementation: { id: "partial" },
          }),
        ],
        components: [stage, partial],
      });

      expect(() => flatten({ definition })).toThrow(
        /`s1` cannot run `partial`: partial has no port named Out/,
      );
    });

    it("checks an implementation once for its instance, however many fusions reach its ports", () => {
      const indices = Array.from({ length: 1000 }, (_, index) => index);
      const ports = (componentId: string) =>
        indices.map((index) =>
          place(`${componentId}_${index}`, { name: `P${index}`, isPort: true }),
        );
      const definition = sdcpn({
        places: indices.map((index) => place(`root_${index}`)),
        componentInstances: [componentInstance("w1", "wide")],
        components: [
          component("wide", { interface: true, places: ports("wide") }),
          component("impl", { implements: ["wide"], places: ports("impl") }),
        ],
        implementations: [
          { interface: { id: "wide" }, component: { id: "impl" } },
        ],
        fusions: indices.map((index) => ({
          id: `f${index}`,
          name: `F${index}`,
          members: [
            { kind: "place", placeId: `root_${index}` },
            {
              kind: "componentPort",
              componentInstanceId: "w1",
              portPlaceId: `wide_${index}`,
            },
          ],
        })),
      });

      const started = Date.now();
      const result = flatten({ definition });
      const elapsedMs = Date.now() - started;

      expect(result.sdcpn.places.map(({ id }) => id)).toEqual(
        indices.map((index) => `root_${index}`),
      );
      // One check takes milliseconds; one for every fusion takes several
      // seconds.
      expect(elapsedMs).toBeLessThan(2_000);
    });

    it("runs many instances off a long list of defaults, with one read of the list", () => {
      const size = 10_000;
      const definition = sdcpn({
        componentInstances: Array.from({ length: size }, (_, index) =>
          componentInstance(`s${index}`, "stage"),
        ),
        components: [stage, implementation("fast")],
        implementations: [
          ...Array.from({ length: 25 * size }, (_, index) => ({
            interface: { id: `other${index}` },
            component: { id: "fast" },
          })),
          { interface: { id: "stage" }, component: { id: "fast" } },
          // Of two entries for one interface the first applies.
          { interface: { id: "stage" }, component: { id: "gone" } },
        ],
      });

      const started = Date.now();
      const result = flatten({ definition });
      const elapsedMs = Date.now() - started;

      expect(result.sdcpn.transitions).toHaveLength(size);
      expect(result.sdcpn.transitions[0]?.id).toBe("s0::fast_work");
      // One read of the list takes milliseconds; a search of it for every
      // instance takes several seconds.
      expect(elapsedMs).toBeLessThan(1_000);
    });

    it("checks what runs once for the instances bound alike, however many", () => {
      // Five thousand ports of one name on the interface, which all map onto
      // the implementation's one: nothing but the check grows with them.
      const wide = component("wide", {
        interface: true,
        places: Array.from({ length: 5_000 }, (_, index) =>
          place(`wide_${index}`, { name: "In", isPort: true }),
        ),
      });
      const narrow = component("narrow", {
        implements: ["wide"],
        places: [place("narrow_in", { name: "In", isPort: true })],
      });
      const instances = 2_000;
      const definition = sdcpn({
        componentInstances: Array.from({ length: instances }, (_, index) =>
          componentInstance(`s${index}`, "wide"),
        ),
        components: [wide, narrow],
        implementations: [
          { interface: { id: "wide" }, component: { id: "narrow" } },
        ],
      });

      const started = Date.now();
      const result = flatten({ definition });
      const elapsedMs = Date.now() - started;

      expect(result.sdcpn.places).toHaveLength(instances);
      // A check of the interface's ports for every instance takes several
      // seconds.
      expect(elapsedMs).toBeLessThan(1_000);
    });

    it("reads an interface's token types once, however many instances of it run", () => {
      const size = 10_000;
      const weight = { elementId: "w", name: "weight", type: "real" } as const;
      const color = (id: string): Color => ({
        id,
        name: id,
        iconSlug: "circle",
        displayColor: "#000",
        elements: [weight],
      });
      const typed = component("typed", {
        interface: true,
        types: Array.from({ length: size }, (_, index) =>
          color(`type-${index}`),
        ),
        places: [
          place("typed_in", {
            name: "In",
            isPort: true,
            colorId: `type-${size - 1}`,
          }),
        ],
      });
      const small = component("small", {
        implements: ["typed"],
        types: [color("t")],
        places: [place("small_in", { name: "In", isPort: true, colorId: "t" })],
      });
      const instances = 5_000;
      const definition = sdcpn({
        componentInstances: Array.from({ length: instances }, (_, index) =>
          componentInstance(`s${index}`, "typed", {
            implementation: { id: "small" },
          }),
        ),
        components: [typed, small],
      });

      const started = Date.now();
      const result = flatten({ definition });
      const elapsedMs = Date.now() - started;

      expect(result.sdcpn.places).toHaveLength(instances);
      // A read of the interface's token types for every instance takes
      // several seconds.
      expect(elapsedMs).toBeLessThan(1_000);
    });
  });
});
