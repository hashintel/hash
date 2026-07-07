import { describe, expect, test } from "vitest";

import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";

import type { SDCPN } from "./types/sdcpn";

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
      differentialEquationId: null,
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
        id: "place-1",
        name: "UpdatedQueue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
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
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
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
    expect(definition.places.map((place) => place.id)).toEqual(["place-2"]);
    expect(definition.transitions[0]!.inputArcs).toEqual([]);
    expect(definition.transitions[0]!.outputArcs).toEqual([
      { placeId: "place-2", weight: 1 },
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
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 0,
        },
        {
          id: "place-3",
          name: "NewInput",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 100,
        },
        {
          id: "place-4",
          name: "NewOutput",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
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
      inputArcs: [{ placeId: "place-3", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "place-4", weight: 1 }],
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
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "place-2",
          name: "Output",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 0,
        },
        {
          id: "place-3",
          name: "RejectedOutput",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
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
      inputArcs: [{ placeId: "place-1", weight: 2, type: "read" }],
      outputArcs: [{ placeId: "place-2", weight: 3 }],
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
          differentialEquationId: null,
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

    expect(transitionKernelCode).toContain("export default TransitionKernel");
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
              differentialEquationId: null,
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

    expect(transitionKernelCode).toContain("export default TransitionKernel");
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
          differentialEquationId: null,
          x: 100,
          y: 0,
        },
        {
          id: "place-2",
          name: "OtherOutput",
          colorId: "type-1",
          dynamicsEnabled: false,
          differentialEquationId: null,
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
              differentialEquationId: null,
              isPort: true,
              x: 0,
              y: 0,
            },
            {
              id: "place-output-port",
              name: "OutputPort",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              isPort: true,
              x: 100,
              y: 0,
            },
            {
              id: "place-internal",
              name: "Internal",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
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
      componentInstanceId: "instance-1",
      portPlaceId: "place-output-port",
    };
    const outputEndpoint = {
      kind: "componentPort" as const,
      componentInstanceId: "instance-1",
      portPlaceId: "place-input-port",
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
      { elementId: "element-1", name: "MassKg", type: "real" },
      { elementId: "element-3", name: "Charge", type: "integer" },
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
          differentialEquationId: "equation-1",
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
          id: "equation-1",
          name: "Motion",
          colorId: "type-1",
          code: "export default Dynamics(() => []);",
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
    expect(definition.places[0]!.differentialEquationId).toBeNull();
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
      differentialEquationId: null,
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
      id: "equation-1",
      name: "Motion",
      colorId: "type-1",
      code: "export default Dynamics(() => []);",
    });
    instance.mutations.addPlace({
      id: "place-1",
      name: "Dynamic",
      colorId: "type-1",
      dynamicsEnabled: true,
      differentialEquationId: "equation-1",
      visualizerCode: "export default Visualization(() => null);",
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
      differentialEquationId: null,
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
              differentialEquationId: null,
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
              differentialEquationId: null,
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
        differentialEquationId: null,
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
      differentialEquationId: null,
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
      { placeId: "place-1", weight: 1, type: "standard" },
    ]);
    expect(instance.definition.get().types[0]!.elements).toEqual([
      { elementId: "element-1", name: "Mass", type: "real" },
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
        differentialEquationId: null,
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
        id: "scenario-1",
        name: "Scenario",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      },
    ]);
    expect(instance.definition.get().metrics).toEqual([
      {
        id: "metric-1",
        name: "Metric",
        code: "return 0;",
      },
    ]);
    expect(instance.definition.get().subnets).toEqual([
      {
        id: "subnet-1",
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
      differentialEquationId: null,
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
        id: "place-1",
        name: "Input",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        isPort: true,
        x: 0,
        y: 0,
      },
    ]);
  });
});
