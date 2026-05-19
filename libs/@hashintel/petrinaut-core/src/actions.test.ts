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

    instance.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    instance.updatePlace({
      placeId: "place-1",
      update: {
        name: "UpdatedQueue",
      },
    });
    instance.updatePlacePosition({
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

    instance.removePlace({ placeId: "place-1" });

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

    instance.updateArcPlace({
      transitionId: "transition-1",
      arcDirection: "input",
      oldPlaceId: "place-1",
      newPlaceId: "place-3",
    });
    instance.updateArcPlace({
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

    instance.addTypeElement({
      typeId: "type-1",
      element: { elementId: "element-3", name: "Charge", type: "integer" },
    });
    instance.updateTypeElement({
      typeId: "type-1",
      elementId: "element-1",
      update: { name: "MassKg" },
    });
    instance.moveTypeElement({
      typeId: "type-1",
      elementId: "element-3",
      toIndex: 1,
    });
    instance.removeTypeElement({
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

    instance.deleteItemsByIds({
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

    instance.addPlace({
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

  test("validates add action inputs before mutating", () => {
    const instance = createInstance();

    expect(() =>
      instance.addPlace({
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

    instance.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });

    expect(() =>
      instance.updatePlace({
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
      callActionWithUnknownInput(instance.updatePlace, {
        placeId: "place-1",
        update: { id: "place-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updatePlace, {
        placeId: "place-1",
        update: { x: 10 },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateTransition, {
        transitionId: "transition-1",
        update: { inputArcs: [] },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateTransition, {
        transitionId: "transition-1",
        update: { y: 10 },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateType, {
        typeId: "type-1",
        update: { elements: [] },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateTypeElement, {
        typeId: "type-1",
        elementId: "element-1",
        update: { elementId: "element-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateDifferentialEquation, {
        equationId: "equation-1",
        update: { id: "equation-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateParameter, {
        parameterId: "parameter-1",
        update: { id: "parameter-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateScenario, {
        scenarioId: "scenario-1",
        update: { id: "scenario-2" },
      }),
    ).toThrow();
    expect(() =>
      callActionWithUnknownInput(instance.updateMetric, {
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
      instance.updateArcPlace({
        transitionId: "transition-1",
        arcDirection: "input",
        oldPlaceId: "place-1",
        newPlaceId: "",
      }),
    ).toThrow();
    expect(() =>
      instance.addTypeElement({
        typeId: "type-1",
        element: { elementId: "element-2", name: "", type: "real" },
      }),
    ).toThrow();
    expect(() =>
      instance.moveTypeElement({
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
      instance.addPlace({
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
      instance.addTransition({
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
      instance.addScenario({
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
      instance.addScenario({
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
});
