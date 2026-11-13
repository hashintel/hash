import { describe, expect, test } from "vitest";

import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";
import { toPetrinautId } from "./petrinaut-id";

import type { SDCPN, Subnet } from "./types/sdcpn";

const idOf = toPetrinautId;

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const cloneSDCPN = (sdcpn: SDCPN): SDCPN =>
  // `structuredClone` is available as a global in both Node and DOM, but we will need to
  // configure TypeScript `types` to be at the intersection of both to avoid DOM dependencies in core.
  // For now we define the type inline to avoid that issue in tests, which run in Node but still need to clone SDCPN documents.
  (
    globalThis as typeof globalThis & {
      structuredClone: <Value>(value: Value) => Value;
    }
  ).structuredClone(sdcpn);

const createInstance = (initial: SDCPN = emptySDCPN) =>
  createPetrinaut({
    document: createJsonDocHandle({ initial: cloneSDCPN(initial) }),
  });

const callActionWithUnknownInput = <Input>(
  action: (input: Input) => void,
  input: unknown,
): void => {
  action(input as Input);
};

describe("Petrinaut core actions", () => {
  test("adds and updates places", () => {
    const instance = createInstance();

    instance.mutations.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    });
    instance.mutations.updatePlace({
      placeId: "place-1",
      update: {
        name: "UpdatedQueue",
      },
    });
    instance.mutations.updatePlacePosition({
      placeId: "place-1",
      position: { x: 12, y: 24 },
    });

    expect(instance.definition.get().places).toEqual([
      {
        id: idOf("place-1"),
        name: "UpdatedQueue",
        colorId: null,
        dynamicsEnabled: false,
        x: 12,
        y: 24,
      },
    ]);
  });

  test("removing a place also removes connected arcs", () => {
    const instance = createInstance({
      ...emptySDCPN,
      places: [
        {
          id: "place-1",
          name: "Input",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          x: 100,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "place-2", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true);",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
    });

    instance.mutations.removePlace({ placeId: "place-1" });

    const definition = instance.definition.get();
    expect(definition.places.map((place) => place.id)).toEqual([
      idOf("place-2"),
    ]);
    expect(definition.transitions[0]!.inputArcs).toEqual([]);
    expect(definition.transitions[0]!.outputArcs).toEqual([
      { placeId: idOf("place-2"), weight: 1 },
    ]);
  });

  test("updates arc endpoints granularly", () => {
    const instance = createInstance({
      ...emptySDCPN,
      places: [
        {
          id: "place-1",
          name: "Input",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          x: 100,
          y: 0,
        },
        {
          id: "place-3",
          name: "NewInput",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 100,
        },
        {
          id: "place-4",
          name: "NewOutput",
          colorId: null,
          dynamicsEnabled: false,
          x: 100,
          y: 100,
        },
      ],
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "place-2", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true);",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
    });

    instance.mutations.updateArcPlace({
      transitionId: "transition-1",
      arcDirection: "input",
      oldPlaceId: "place-1",
      newPlaceId: "place-3",
    });
    instance.mutations.updateArcPlace({
      transitionId: "transition-1",
      arcDirection: "output",
      oldPlaceId: "place-2",
      newPlaceId: "place-4",
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      inputArcs: [{ placeId: idOf("place-3"), weight: 1, type: "standard" }],
      outputArcs: [{ placeId: idOf("place-4"), weight: 1 }],
    });
  });

  test("adds and updates read input arcs", () => {
    const instance = createInstance({
      ...emptySDCPN,
      places: [
        {
          id: "place-1",
          name: "Input",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          x: 100,
          y: 0,
        },
        {
          id: "place-3",
          name: "RejectedOutput",
          colorId: null,
          dynamicsEnabled: false,
          x: 200,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true);",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
    });

    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "input",
      placeId: "place-1",
      weight: 2,
      type: "read",
    });
    instance.mutations.updateArcType({
      transitionId: "transition-1",
      placeId: "place-1",
      type: "standard",
    });
    instance.mutations.updateArcType({
      transitionId: "transition-1",
      placeId: "place-1",
      type: "read",
    });
    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "output",
      placeId: "place-2",
      weight: 3,
    });

    expect(() =>
      callActionWithUnknownInput(instance.mutations.addArc, {
        transitionId: "transition-1",
        arcDirection: "output",
        placeId: "place-3",
        weight: 1,
        type: "read",
      }),
    ).toThrow();

    expect(instance.definition.get().transitions[0]).toMatchObject({
      inputArcs: [{ placeId: idOf("place-1"), weight: 2, type: "read" }],
      outputArcs: [{ placeId: idOf("place-2"), weight: 3 }],
    });
  });

  test("loads default transition kernel code when adding a typed output arc", () => {
    const instance = createInstance({
      ...emptySDCPN,
      types: [
        {
          id: "type-1",
          name: "Particle",
          iconSlug: "circle",
          displayColor: "#34a0fa",
          elements: [{ elementId: "element-1", name: "Mass", type: "real" }],
        },
      ],
      places: [
        {
          id: "place-1",
          name: "Output",
          colorId: "type-1",
          dynamicsEnabled: false,
          x: 100,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
    });

    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "output",
      placeId: "place-1",
      weight: 2,
    });

    const transitionKernelCode =
      instance.definition.get().transitions[0]!.transitionKernelCode;

    expect(transitionKernelCode).not.toContain("export default");
    expect(transitionKernelCode).toContain("return {");
    expect(transitionKernelCode).toContain("Output: [");
    expect(transitionKernelCode.match(/Mass: 0/g)).toHaveLength(2);
  });

  test("loads default transition kernel code for typed component-port outputs", () => {
    const instance = createInstance({
      ...emptySDCPN,
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
      componentInstances: [
        {
          id: "instance-1",
          name: "Reusable instance",
          subnetId: "subnet-1",
          parameterValues: {},
          x: 100,
          y: 100,
        },
      ],
      subnets: [
        {
          id: "subnet-1",
          name: "Reusable subnet",
          places: [
            {
              id: "place-output-port",
              name: "PortOutput",
              colorId: "type-1",
              dynamicsEnabled: false,
              isPort: true,
              x: 100,
              y: 0,
            },
          ],
          transitions: [],
          types: [
            {
              id: "type-1",
              name: "Particle",
              iconSlug: "circle",
              displayColor: "#34a0fa",
              elements: [
                { elementId: "element-1", name: "Mass", type: "real" },
              ],
            },
          ],
          differentialEquations: [],
          parameters: [],
          componentInstances: [],
        },
      ],
    });

    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "output",
      endpoint: {
        kind: "componentPort",
        componentInstanceId: "instance-1",
        portPlaceId: "place-output-port",
      },
      weight: 1,
    });

    const transitionKernelCode =
      instance.definition.get().transitions[0]!.transitionKernelCode;

    expect(transitionKernelCode).not.toContain("export default");
    expect(transitionKernelCode).toContain("return {");
    expect(transitionKernelCode).toContain("PortOutput: [");
    expect(transitionKernelCode).toContain("Mass: 0");
  });

  test("does not replace existing transition kernel code when adding a typed output arc", () => {
    const existingKernelCode =
      "export default TransitionKernel(() => ({ Output: [{ Mass: 42 }] }));";
    const instance = createInstance({
      ...emptySDCPN,
      types: [
        {
          id: "type-1",
          name: "Particle",
          iconSlug: "circle",
          displayColor: "#34a0fa",
          elements: [{ elementId: "element-1", name: "Mass", type: "real" }],
        },
      ],
      places: [
        {
          id: "place-1",
          name: "Output",
          colorId: "type-1",
          dynamicsEnabled: false,
          x: 100,
          y: 0,
        },
        {
          id: "place-2",
          name: "OtherOutput",
          colorId: "type-1",
          dynamicsEnabled: false,
          x: 200,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [],
          outputArcs: [{ placeId: "place-1", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: existingKernelCode,
          x: 50,
          y: 0,
        },
      ],
    });

    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "output",
      placeId: "place-2",
      weight: 1,
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      transitionKernelCode: existingKernelCode,
    });
  });

  test("adds, validates, and cleans up component-port arcs", () => {
    const instance = createInstance({
      ...emptySDCPN,
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true);",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
      componentInstances: [
        {
          id: "instance-1",
          name: "Reusable instance",
          subnetId: "subnet-1",
          parameterValues: {},
          x: 100,
          y: 100,
        },
      ],
      subnets: [
        {
          id: "subnet-1",
          name: "Reusable subnet",
          places: [
            {
              id: "place-input-port",
              name: "InputPort",
              colorId: null,
              dynamicsEnabled: false,
              isPort: true,
              x: 0,
              y: 0,
            },
            {
              id: "place-output-port",
              name: "OutputPort",
              colorId: null,
              dynamicsEnabled: false,
              isPort: true,
              x: 100,
              y: 0,
            },
            {
              id: "place-internal",
              name: "Internal",
              colorId: null,
              dynamicsEnabled: false,
              x: 200,
              y: 0,
            },
          ],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
          componentInstances: [],
        },
      ],
    });

    const inputEndpoint = {
      kind: "componentPort" as const,
      componentInstanceId: idOf("instance-1"),
      portPlaceId: idOf("place-output-port"),
    };
    const outputEndpoint = {
      kind: "componentPort" as const,
      componentInstanceId: idOf("instance-1"),
      portPlaceId: idOf("place-input-port"),
    };

    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "output",
      endpoint: outputEndpoint,
      weight: 2,
    });
    instance.mutations.addArc({
      transitionId: "transition-1",
      arcDirection: "input",
      endpoint: inputEndpoint,
      weight: 1,
      type: "read",
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      inputArcs: [{ endpoint: inputEndpoint, weight: 1, type: "read" }],
      outputArcs: [{ endpoint: outputEndpoint, weight: 2 }],
    });

    expect(() =>
      instance.mutations.addArc({
        transitionId: "transition-1",
        arcDirection: "output",
        endpoint: {
          kind: "componentPort",
          componentInstanceId: "instance-1",
          portPlaceId: "place-internal",
        },
        weight: 1,
      }),
    ).toThrow("only places marked `isPort` can be used as component ports");

    instance.mutations.removePlace({
      targetSubnetId: "subnet-1",
      placeId: "place-input-port",
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      inputArcs: [{ endpoint: inputEndpoint, weight: 1, type: "read" }],
      outputArcs: [],
    });

    instance.mutations.removeComponentInstance({ instanceId: "instance-1" });

    expect(instance.definition.get().componentInstances).toEqual([]);
    expect(instance.definition.get().transitions[0]).toMatchObject({
      inputArcs: [],
      outputArcs: [],
    });
  });

  test("adds, updates, removes, and moves type elements granularly", () => {
    const instance = createInstance({
      ...emptySDCPN,
      types: [
        {
          id: "type-1",
          name: "Particle",
          iconSlug: "circle",
          displayColor: "#34a0fa",
          elements: [
            { elementId: "element-1", name: "Mass", type: "real" },
            { elementId: "element-2", name: "Velocity", type: "real" },
          ],
        },
      ],
    });

    instance.mutations.addTypeElement({
      typeId: "type-1",
      element: { elementId: "element-3", name: "Charge", type: "integer" },
    });
    instance.mutations.updateTypeElement({
      typeId: "type-1",
      elementId: "element-1",
      update: { name: "MassKg" },
    });
    instance.mutations.moveTypeElement({
      typeId: "type-1",
      elementId: "element-3",
      toIndex: 1,
    });
    instance.mutations.removeTypeElement({
      typeId: "type-1",
      elementId: "element-2",
    });

    expect(instance.definition.get().types[0]!.elements).toEqual([
      { elementId: idOf("element-1"), name: "MassKg", type: "real" },
      { elementId: idOf("element-3"), name: "Charge", type: "integer" },
    ]);
  });

  test("deleteItemsByIds removes referenced types and equations", () => {
    const instance = createInstance({
      ...emptySDCPN,
      places: [
        {
          id: "place-1",
          name: "Dynamic",
          colorId: "type-1",
          dynamicsEnabled: true,
          dynamics: [{ differentialEquationId: "equation-1" }],
          x: 0,
          y: 0,
        },
      ],
      types: [
        {
          id: "type-1",
          name: "Particle",
          iconSlug: "circle",
          displayColor: "#34a0fa",
          elements: [],
        },
      ],
      differentialEquations: [
        {
          arity: 1,
          id: "equation-1",
          name: "Motion",
          colorId: "type-1",
          code: "export default Dynamics((token) => ({}));",
        },
      ],
    });

    instance.mutations.deleteItemsByIds({
      items: [
        { type: "type", id: "type-1" },
        { type: "differentialEquation", id: "equation-1" },
      ],
    });

    const definition = instance.definition.get();
    expect(definition.types).toEqual([]);
    expect(definition.differentialEquations).toEqual([]);
    expect(definition.places[0]!.colorId).toBeNull();
    expect(definition.places[0]!.dynamics).toEqual([]);
  });

  test("composes further equations into a place and validates their colour", () => {
    const instance = createInstance();
    instance.mutations.addType({
      id: "type-1",
      name: "Particle",
      iconSlug: "circle",
      displayColor: "#34a0fa",
      elements: [{ elementId: "x", name: "x", type: "real" }],
    });
    instance.mutations.addType({
      id: "type-2",
      name: "Other",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [{ elementId: "y", name: "y", type: "real" }],
    });
    instance.mutations.addDifferentialEquation({
      id: "drift",
      name: "Drift",
      colorId: "type-1",
      code: "return { x: 1 };",
      arity: 1,
    });
    instance.mutations.addDifferentialEquation({
      id: "pull",
      name: "Pull",
      colorId: "type-1",
      code: "return [{ x: 1 }, { x: -1 }];",
      arity: 2,
    });
    instance.mutations.addDifferentialEquation({
      id: "other",
      name: "Other",
      colorId: "type-2",
      code: "return [{ y: 1 }, { y: -1 }];",
      arity: 2,
    });
    instance.mutations.addPlace({
      id: "place-1",
      name: "Space",
      colorId: "type-1",
      dynamicsEnabled: true,
      dynamics: [
        { differentialEquationId: "drift" },
        { differentialEquationId: "pull" },
      ],
      x: 0,
      y: 0,
    });

    expect(instance.definition.get().places[0]).toMatchObject({
      dynamics: [
        { differentialEquationId: idOf("drift") },
        { differentialEquationId: idOf("pull") },
      ],
    });
    expect(instance.definition.get().differentialEquations[1]).toMatchObject({
      id: idOf("pull"),
      arity: 2,
    });

    expect(() =>
      instance.mutations.updatePlace({
        placeId: "place-1",
        update: { dynamics: [{ differentialEquationId: "other" }] },
      }),
    ).toThrow(/colorId/);
    expect(() =>
      instance.mutations.updatePlace({
        placeId: "place-1",
        update: { dynamics: [{ differentialEquationId: "missing" }] },
      }),
    ).toThrow(/does not exist/);
    expect(() =>
      instance.mutations.updateDifferentialEquation({
        equationId: "pull",
        update: { arity: 0 },
      }),
    ).toThrow();

    instance.mutations.removeDifferentialEquation({ equationId: "pull" });
    expect(instance.definition.get().places[0]).toMatchObject({
      dynamics: [{ differentialEquationId: idOf("drift") }],
    });

    instance.mutations.removeDifferentialEquation({ equationId: "drift" });
    expect(instance.definition.get().places[0]).toMatchObject({
      dynamics: [],
    });
  });

  test("does not mutate readonly instances", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: cloneSDCPN(emptySDCPN) }),
      readonly: true,
    });

    instance.mutations.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    });

    expect(instance.definition.get().places).toEqual([]);
  });

  test("honors disabled extension capabilities", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: cloneSDCPN(emptySDCPN),
        capabilities: {
          disabledExtensions: [
            "colors",
            "stochasticity",
            "dynamics",
            "parameters",
          ],
        },
      }),
    });

    instance.mutations.addType({
      id: "type-1",
      name: "Particle",
      iconSlug: "circle",
      displayColor: "#34a0fa",
      elements: [],
    });
    instance.mutations.addDifferentialEquation({
      arity: 1,
      id: "equation-1",
      name: "Motion",
      colorId: "type-1",
      code: "export default Dynamics((token) => ({}));",
    });
    instance.mutations.addPlace({
      id: "place-1",
      name: "Dynamic",
      colorId: "type-1",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "equation-1" }],
      visualizerCode: "return <Visualizer.Svg />;",
      x: 0,
      y: 0,
    });
    instance.mutations.addTransition({
      id: "transition-1",
      name: "Move",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 1);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
    });
    instance.mutations.addParameter({
      id: "parameter-1",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    });

    const definition = instance.definition.get();
    expect(definition.types).toEqual([]);
    expect(definition.differentialEquations).toEqual([]);
    expect(definition.parameters).toEqual([]);
    expect(definition.places[0]).toMatchObject({
      colorId: null,
      dynamicsEnabled: false,
    });
    expect(definition.places[0]).not.toHaveProperty("visualizerCode");
    expect(definition.transitions[0]).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
  });

  test("keeps predicate lambda code when stochasticity is disabled but coloured inputs exist", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: cloneSDCPN({
          ...emptySDCPN,
          types: [
            {
              id: "type-1",
              name: "Particle",
              iconSlug: "circle",
              displayColor: "#34a0fa",
              elements: [
                { elementId: "element-1", name: "Mass", type: "real" },
              ],
            },
          ],
          places: [
            {
              id: "place-1",
              name: "Input",
              colorId: "type-1",
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
          ],
        }),
        capabilities: {
          disabledExtensions: ["stochasticity"],
        },
      }),
    });

    instance.mutations.addTransition({
      id: "transition-1",
      name: "Move",
      inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda((input) => input.Input[0].Mass > 0);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "export default Lambda((input) => input.Input[0].Mass > 0);",
    });
  });

  test("clears predicate lambda code when stochasticity is disabled and no coloured standard/read input exists", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: cloneSDCPN({
          ...emptySDCPN,
          places: [
            {
              id: "place-1",
              name: "Input",
              colorId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
          ],
        }),
        capabilities: {
          disabledExtensions: ["stochasticity"],
        },
      }),
    });

    instance.mutations.addTransition({
      id: "transition-1",
      name: "Move",
      inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });

    expect(instance.definition.get().transitions[0]).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
    });
  });

  test("validates add action inputs before mutating", () => {
    const instance = createInstance();

    expect(() =>
      instance.mutations.addPlace({
        id: "",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      }),
    ).toThrow();

    expect(instance.definition.get().places).toEqual([]);
  });

  test("validates callback-updated entities", () => {
    const instance = createInstance();

    instance.mutations.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    });

    expect(() =>
      instance.mutations.updatePlace({
        placeId: "place-1",
        update: {
          name: "",
        },
      }),
    ).toThrow();
  });

  test("rejects over-wide update action payloads", () => {
    const instance = createInstance();

    expect(() =>
      callActionWithUnknownInput(instance.mutations.updatePlace, {
        placeId: "place-1",
        update: { id: "place-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updatePlace, {
        placeId: "place-1",
        update: { x: 10 },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateTransition, {
        transitionId: "transition-1",
        update: { inputArcs: [] },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateTransition, {
        transitionId: "transition-1",
        update: { y: 10 },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateType, {
        typeId: "type-1",
        update: { elements: [] },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateTypeElement, {
        typeId: "type-1",
        elementId: "element-1",
        update: { elementId: "element-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(
        instance.mutations.updateDifferentialEquation,
        {
          equationId: "equation-1",
          update: { id: "equation-2" },
        },
      ),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateParameter, {
        parameterId: "parameter-1",
        update: { id: "parameter-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateScenario, {
        scenarioId: "scenario-1",
        update: { id: "scenario-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.mutations.updateMetric, {
        metricId: "metric-1",
        update: { id: "metric-2" },
      }),
    ).toThrow();
  });

  test("validates granular arc and type element action inputs", () => {
    const instance = createInstance({
      ...emptySDCPN,
      transitions: [
        {
          id: "transition-1",
          name: "Move",
          inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true);",
          transitionKernelCode: "",
          x: 50,
          y: 0,
        },
      ],
      types: [
        {
          id: "type-1",
          name: "Particle",
          iconSlug: "circle",
          displayColor: "#34a0fa",
          elements: [{ elementId: "element-1", name: "Mass", type: "real" }],
        },
      ],
    });

    expect(() =>
      instance.mutations.updateArcPlace({
        transitionId: "transition-1",
        arcDirection: "input",
        oldPlaceId: "place-1",
        newPlaceId: "",
      }),
    ).toThrow();
    expect(() =>
      instance.mutations.addTypeElement({
        typeId: "type-1",
        element: { elementId: "element-2", name: "", type: "real" },
      }),
    ).toThrow();
    expect(() =>
      instance.mutations.moveTypeElement({
        typeId: "type-1",
        elementId: "element-1",
        toIndex: -1,
      }),
    ).toThrow();

    expect(instance.definition.get().transitions[0]!.inputArcs).toEqual([
      { placeId: idOf("place-1"), weight: 1, type: "standard" },
    ]);
    expect(instance.definition.get().types[0]!.elements).toEqual([
      { elementId: idOf("element-1"), name: "Mass", type: "real" },
    ]);
  });

  test("reuses existing name validation rules for action inputs", () => {
    const instance = createInstance();

    expect(() =>
      instance.mutations.addPlace({
        id: "place-1",
        name: "invalid place name",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      }),
    ).toThrow();

    expect(() =>
      instance.mutations.addTransition({
        id: "transition-1",
        name: "Display Name",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 0,
        y: 0,
      }),
    ).not.toThrow();
  });

  test("preserves scenario-specific validation in action inputs", () => {
    const instance = createInstance();

    expect(() =>
      instance.mutations.addScenario({
        id: "scenario-1",
        name: "Scenario",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 1 },
          { type: "integer", identifier: "launch_rate", default: 2 },
        ],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      }),
    ).toThrow();

    expect(() =>
      instance.mutations.addScenario({
        id: "scenario-1",
        name: "Scenario",
        scenarioParameters: [
          { type: "real", identifier: "LaunchRate", default: 1 },
        ],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      }),
    ).toThrow();
  });

  test("adds optional root collections when they are initially absent", () => {
    const instance = createInstance();

    instance.mutations.addScenario({
      id: "scenario-1",
      name: "Scenario",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    });
    instance.mutations.addMetric({
      id: "metric-1",
      name: "Metric",
      code: "return 0;",
    });
    instance.mutations.addSubnet({
      id: "subnet-1",
      name: "Reusable subnet",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      componentInstances: [],
    });

    expect(instance.definition.get().scenarios).toEqual([
      {
        id: idOf("scenario-1"),
        name: "Scenario",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      },
    ]);
    expect(instance.definition.get().metrics).toEqual([
      {
        id: idOf("metric-1"),
        name: "Metric",
        code: "return 0;",
      },
    ]);
    expect(instance.definition.get().subnets).toEqual([
      {
        id: toPetrinautId("subnet-1"),
        name: "Reusable subnet",
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        componentInstances: [],
      },
    ]);
  });

  test("targets place mutations at a subnet when targetSubnetId is provided", () => {
    const instance = createInstance();

    instance.mutations.addSubnet({
      id: "subnet-1",
      name: "Reusable subnet",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      componentInstances: [],
    });
    instance.mutations.addPlace({
      targetSubnetId: "subnet-1",
      id: "place-1",
      name: "Input",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    });
    instance.mutations.updatePlace({
      targetSubnetId: "subnet-1",
      placeId: "place-1",
      update: { isPort: true },
    });

    const definition = instance.definition.get();
    expect(definition.places).toEqual([]);
    expect(definition.subnets?.[0]?.places).toEqual([
      {
        id: idOf("place-1"),
        name: "Input",
        colorId: null,
        dynamicsEnabled: false,
        isPort: true,
        x: 0,
        y: 0,
      },
    ]);
  });

  test("names an id as written in errors about it", () => {
    const instance = createInstance();

    expect(() =>
      instance.mutations.addArc({
        transitionId: "serve",
        arcDirection: "input",
        placeId: "queu",
        weight: 1,
      }),
    ).toThrow("Arc references place ID `queu` which does not exist");
  });
});

describe("Petrinaut core fusion actions", () => {
  const portPlace = (id: string, name: string) => ({
    id,
    name,
    colorId: null,
    dynamicsEnabled: false,
    isPort: true,
    x: 0,
    y: 0,
  });

  const composed = (): SDCPN => ({
    ...emptySDCPN,
    places: [
      {
        id: "buffer",
        name: "Buffer",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      },
    ],
    subnets: [
      {
        id: "machine",
        name: "Machine",
        places: [portPlace("in", "In"), portPlace("out", "Out")],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    ],
    componentInstances: [
      {
        id: "m1",
        name: "M1",
        subnetId: "machine",
        parameterValues: {},
        x: 0,
        y: 0,
      },
      {
        id: "m2",
        name: "M2",
        subnetId: "machine",
        parameterValues: {},
        x: 0,
        y: 0,
      },
    ],
  });

  const port = (instanceId: string, portPlaceId: string) => ({
    kind: "componentPort" as const,
    componentInstanceId: idOf(instanceId),
    portPlaceId: idOf(portPlaceId),
  });

  test("adds a fusion and merges fusions that share a member", () => {
    const instance = createInstance(composed());

    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "in"), port("m2", "in")],
    });

    expect(instance.definition.get().fusions).toEqual([
      {
        id: idOf("f2"),
        members: [
          port("m1", "in"),
          port("m2", "in"),
          { kind: "place", placeId: idOf("buffer") },
        ],
      },
    ]);
  });

  test("adds and removes members, dropping a fusion left with one", () => {
    const instance = createInstance(composed());

    instance.mutations.addFusion({
      id: "f1",
      members: [port("m1", "out"), port("m2", "in")],
    });
    instance.mutations.addFusionMember({
      fusionId: "f1",
      member: { kind: "place", placeId: "buffer" },
    });
    expect(instance.definition.get().fusions?.[0]?.members).toHaveLength(3);

    instance.mutations.removeFusionMember({
      fusionId: "f1",
      member: port("m2", "in"),
    });
    instance.mutations.removeFusionMember({
      fusionId: "f1",
      member: { kind: "place", placeId: "buffer" },
    });
    expect(instance.definition.get().fusions).toBeUndefined();
  });

  test("rejects a port that does not exist, a place that is not a port, a member twice and a second anchor", () => {
    const definition = composed();
    definition.places.push({ ...definition.places[0]!, id: "store" });
    definition.subnets![0]!.places.push({
      ...portPlace("hidden", "Hidden"),
      isPort: false,
    });
    const instance = createInstance(definition);
    const buffer = { kind: "place" as const, placeId: "buffer" };

    expect(() =>
      instance.mutations.addFusion({
        id: "f1",
        members: [buffer, port("m1", "missing")],
      }),
    ).toThrow(/Fusion references .* which does not exist/);
    expect(() =>
      instance.mutations.addFusion({
        id: "f1",
        members: [buffer, port("m1", "hidden")],
      }),
    ).toThrow(/isPort/);
    expect(() =>
      instance.mutations.addFusion({ id: "f1", members: [buffer, buffer] }),
    ).toThrow(/names each place or port once/);
    expect(() =>
      instance.mutations.addFusion({
        id: "f1",
        members: [buffer, { kind: "place", placeId: "store" }],
      }),
    ).toThrow(/at most one place of its own net/);
    expect(instance.definition.get().fusions).toBeUndefined();
  });

  test("names a fusion, describes it, and clears both", () => {
    const instance = createInstance(composed());
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    const fusion = () => instance.definition.get().fusions?.[0];

    instance.mutations.updateFusion({
      fusionId: "f1",
      update: { name: "Belt", description: "Between the two machines" },
    });
    expect(fusion()).toMatchObject({
      name: "Belt",
      description: "Between the two machines",
    });

    instance.mutations.updateFusion({
      fusionId: "f1",
      update: { name: undefined, description: undefined },
    });
    expect(fusion()).not.toHaveProperty("name");
    expect(fusion()).not.toHaveProperty("description");
  });

  test("removing a place, an instance or a port takes it out of its fusions", () => {
    const instance = createInstance(composed());
    instance.mutations.addFusion({
      id: "f1",
      members: [
        { kind: "place", placeId: "buffer" },
        port("m1", "in"),
        port("m2", "in"),
      ],
    });

    instance.mutations.removePlace({ placeId: "buffer" });
    expect(instance.definition.get().fusions?.[0]?.members).toEqual([
      port("m1", "in"),
      port("m2", "in"),
    ]);

    instance.mutations.removeComponentInstance({ instanceId: "m2" });
    expect(instance.definition.get().fusions).toBeUndefined();

    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "in"), port("m1", "out")],
    });
    instance.mutations.updatePlace({
      placeId: "in",
      targetSubnetId: "machine",
      update: { isPort: false },
    });
    expect(instance.definition.get().fusions).toBeUndefined();
  });

  test("an instance pointed at another subnet leaves the fusions and arcs on its old ports", () => {
    const definition = composed();
    definition.subnets!.push({
      ...definition.subnets![0]!,
      id: "press",
      name: "Press",
      places: [portPlace("press_in", "In")],
    });
    definition.transitions.push({
      id: "feed",
      name: "Feed",
      inputArcs: [],
      outputArcs: [{ endpoint: port("m1", "in"), weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });
    const instance = createInstance(definition);
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "out")],
    });

    instance.mutations.updateComponentInstance({
      instanceId: "m1",
      update: { subnetId: "press" },
    });

    const document = instance.definition.get();
    expect(document.fusions).toBeUndefined();
    expect(document.transitions[0]?.outputArcs).toEqual([]);
  });

  test("a place that is no port is added without a direction", () => {
    const instance = createInstance(composed());

    instance.mutations.addPlace({
      id: "plain",
      name: "Plain",
      colorId: null,
      dynamicsEnabled: false,
      portDirection: "in",
      x: 0,
      y: 0,
    });
    const added = instance.definition.get().places.at(-1);
    expect(added?.name).toBe("Plain");
    expect(added).not.toHaveProperty("portDirection");
  });

  test("unmarking a port clears its direction", () => {
    const instance = createInstance(composed());

    instance.mutations.updatePlace({
      placeId: "in",
      targetSubnetId: "machine",
      update: { portDirection: "in" },
    });
    expect(
      instance.definition.get().subnets?.[0]?.places[0]?.portDirection,
    ).toBe("in");

    instance.mutations.updatePlace({
      placeId: "in",
      targetSubnetId: "machine",
      update: { isPort: false },
    });
    expect(
      instance.definition.get().subnets?.[0]?.places[0]?.portDirection,
    ).toBeUndefined();
  });

  test("deleting items by id removes fusions and their dangling members", () => {
    const instance = createInstance(composed());
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "out"), port("m2", "in")],
    });

    instance.mutations.deleteItemsByIds({
      items: [
        { type: "fusion", id: "f1" },
        { type: "componentInstance", id: "m2" },
      ],
    });

    expect(instance.definition.get().fusions).toBeUndefined();
    expect(instance.definition.get().componentInstances).toHaveLength(1);
  });
});

describe("Petrinaut core interface actions", () => {
  const port = (id: string, name: string) => ({
    id,
    name,
    colorId: null,
    dynamicsEnabled: false,
    isPort: true,
    x: 0,
    y: 0,
  });

  const stageSubnet = (id: string, extra: Partial<Subnet> = {}): Subnet => ({
    id,
    name: id,
    places: [port(`${id}_in`, "In"), port(`${id}_out`, "Out")],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    ...extra,
  });

  const withInterface = (): SDCPN => ({
    ...emptySDCPN,
    subnets: [
      stageSubnet("stage", { interface: true }),
      stageSubnet("fast", { implements: ["stage"] }),
      stageSubnet("slow", { implements: ["stage"] }),
      stageSubnet("other"),
    ],
    componentInstances: [
      {
        id: "s1",
        name: "S1",
        subnetId: "stage",
        parameterValues: {},
        x: 0,
        y: 0,
      },
    ],
  });

  test("sets and clears the document's default implementation", () => {
    const instance = createInstance(withInterface());

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "fast",
    });
    expect(instance.definition.get().implementations).toEqual({
      [idOf("stage")]: idOf("fast"),
    });

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: null,
    });
    expect(instance.definition.get().implementations).toBeUndefined();
  });

  test("refuses a default that is not an implementation of the interface", () => {
    const instance = createInstance(withInterface());

    expect(() =>
      instance.mutations.setImplementation({
        interfaceId: "stage",
        implementationId: "other",
      }),
    ).toThrow(/does not implement/);
    expect(() =>
      instance.mutations.setImplementation({
        interfaceId: "fast",
        implementationId: "slow",
      }),
    ).toThrow(/not an interface/);
  });

  test("holds a default and an instance's choice to the one rule", () => {
    const instance = createInstance({
      ...withInterface(),
      subnets: [
        ...(withInterface().subnets ?? []),
        stageSubnet("draft", { interface: true, implements: ["stage"] }),
      ],
    });

    // An interface runs nothing, whatever it says it implements.
    expect(() =>
      instance.mutations.setImplementation({
        interfaceId: "stage",
        implementationId: "draft",
      }),
    ).toThrow(/which is an interface itself/);
    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: "draft" },
      }),
    ).toThrow(/which is an interface itself/);
    // An instance of a component has nothing to choose.
    expect(() =>
      instance.mutations.addComponentInstance({
        id: "o1",
        name: "O1",
        subnetId: "other",
        implementation: "fast",
        parameterValues: {},
        x: 0,
        y: 0,
      }),
    ).toThrow(/is not an interface/);
  });

  test("an instance loaded with a choice that cannot run is still edited, and its choice repaired", () => {
    const loaded = withInterface();
    const instance = createInstance({
      ...loaded,
      componentInstances: loaded.componentInstances?.map((existing) => ({
        ...existing,
        implementation: "other",
      })),
    });

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { name: "Renamed" },
    });
    expect(instance.definition.get().componentInstances?.[0]).toMatchObject({
      name: "Renamed",
      implementation: idOf("other"),
    });
    // Making the same choice again is held to the rule.
    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: "other" },
      }),
    ).toThrow(/does not implement/);
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: "fast" },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toBe(idOf("fast"));
  });

  test("a subnet that stops being an interface is implemented by none", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateSubnet({
      subnetId: "stage",
      update: { interface: undefined },
    });
    for (const id of ["fast", "slow"]) {
      expect(
        instance.definition
          .get()
          .subnets?.find((subnet) => subnet.id === idOf(id)),
      ).not.toHaveProperty("implements");
    }
  });

  test("an instance pointed at another subnet lets go of its implementation", () => {
    const instance = createInstance(withInterface());
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: "fast" },
    });

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { subnetId: "other" },
    });
    expect(instance.definition.get().componentInstances?.[0]).toMatchObject({
      subnetId: idOf("other"),
    });
    expect(
      instance.definition.get().componentInstances?.[0],
    ).not.toHaveProperty("implementation");
  });

  test("a change to one subnet leaves the defaults of the others as they are", () => {
    const instance = createInstance({
      ...withInterface(),
      // Loaded as is: `other` does not say it implements the stage.
      implementations: { stage: "other" },
    });
    const patches: unknown[] = [];
    instance.handle.subscribe((event) =>
      patches.push(...(event.patches ?? [])),
    );

    instance.mutations.updateSubnet({
      subnetId: "slow",
      update: { name: "Slower" },
    });
    expect(instance.definition.get().implementations).toEqual({
      [idOf("stage")]: idOf("other"),
    });
    expect(JSON.stringify(patches)).not.toContain("implementations");

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "fast",
    });
    expect(JSON.stringify(patches)).toContain(
      JSON.stringify(["implementations", idOf("stage")]),
    );
  });

  test("refuses a subnet that implements something that is no interface", () => {
    const instance = createInstance(withInterface());

    expect(() =>
      instance.mutations.updateSubnet({
        subnetId: "other",
        update: { implements: ["missing"] },
      }),
    ).toThrow(/which does not exist/);
    expect(() =>
      instance.mutations.addSubnet(
        stageSubnet("another", { implements: ["fast"] }),
      ),
    ).toThrow(/which is not an interface/);
  });

  test("lets an instance choose and clear its own implementation", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: "slow" },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toBe(idOf("slow"));

    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: "other" },
      }),
    ).toThrow(/does not implement/);

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: undefined },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toBeUndefined();
  });

  test("a subnet that stops implementing an interface, or being one, leaves no binding behind", () => {
    const bound = () => {
      const instance = createInstance(withInterface());
      instance.mutations.setImplementation({
        interfaceId: "stage",
        implementationId: "fast",
      });
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: "fast" },
      });
      return instance;
    };

    const unticked = bound();
    unticked.mutations.updateSubnet({
      subnetId: "fast",
      update: { implements: undefined },
    });
    expect(unticked.definition.get().implementations).toBeUndefined();
    expect(
      unticked.definition.get().componentInstances?.[0],
    ).not.toHaveProperty("implementation");
    // The instance can still be edited afterwards.
    unticked.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { name: "Renamed" },
    });
    expect(unticked.definition.get().componentInstances?.[0]?.name).toBe(
      "Renamed",
    );

    const demoted = bound();
    demoted.mutations.updateSubnet({
      subnetId: "stage",
      update: { interface: undefined },
    });
    expect(demoted.definition.get().implementations).toBeUndefined();
    expect(demoted.definition.get().componentInstances?.[0]).not.toHaveProperty(
      "implementation",
    );
  });

  test("removing a subnet drops the bindings and implements entries that named it", () => {
    const instance = createInstance(withInterface());
    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "fast",
    });
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: "fast" },
    });

    instance.mutations.removeSubnet({ subnetId: "fast" });
    const definition = instance.definition.get();
    expect(definition.implementations).toBeUndefined();
    expect(definition.componentInstances?.[0]?.implementation).toBeUndefined();

    instance.mutations.removeSubnet({ subnetId: "stage" });
    expect(
      instance.definition.get().subnets?.find(({ id }) => id === idOf("slow"))
        ?.implements,
    ).toBeUndefined();
  });

  test("clearing the interface flag deletes it", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateSubnet({
      subnetId: "stage",
      update: { interface: undefined },
    });
    expect(
      instance.definition.get().subnets?.find(({ id }) => id === idOf("stage"))
        ?.interface,
    ).toBeUndefined();
  });
});
