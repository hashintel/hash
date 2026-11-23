import { describe, expect, test } from "vitest";

import {
  gateLibrary,
  logistics,
  tankLibrary,
} from "../composition/libraries.test-helpers";
import { toPetrinautId } from "../document/petrinaut-id";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut } from "../instance/instance";
import {
  componentInstanceSchema,
  componentSchema,
  maxComponentIconLength,
} from "../schemas/entity-schemas";
import { mutationActionInputSchemas } from "./action-schemas";
import { createPetrinautActions, updatePrunesReferences } from "./actions";

import type { ArcEndpoint, Component, SDCPN } from "../types/sdcpn";

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
          component: { id: "component-1" },
          parameterValues: {},
          x: 100,
          y: 100,
        },
      ],
      components: [
        {
          id: "component-1",
          name: "Reusable component",
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

  /**
   * A net of `transitionCount` transitions that write a kernel into the
   * coloured place `place-1`, all but the last, which writes into the
   * coloured place `place-2`.
   */
  const netOfKernels = (transitionCount: number): SDCPN => ({
    ...emptySDCPN,
    types: [
      {
        id: idOf("type-1"),
        name: "Particle",
        iconSlug: "circle",
        displayColor: "#34a0fa",
        elements: [{ elementId: "element-1", name: "Mass", type: "real" }],
      },
    ],
    places: ["place-1", "place-2"].map((id, index) => ({
      id: idOf(id),
      name: `Output${index}`,
      colorId: idOf("type-1"),
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    })),
    transitions: Array.from({ length: transitionCount }, (_, index) => ({
      id: idOf(`transition-${index}`),
      name: `Move${index}`,
      inputArcs: [],
      outputArcs: [
        {
          placeId: idOf(index === transitionCount - 1 ? "place-2" : "place-1"),
          weight: 1,
        },
      ],
      lambdaType: "predicate" as const,
      lambdaCode: "",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
    })),
  });

  test("settles every transition of the net when a place loses its colour", () => {
    const instance = createInstance(netOfKernels(3));

    instance.mutations.updatePlace({
      placeId: "place-1",
      update: { colorId: null },
    });

    expect(
      instance.definition
        .get()
        .transitions.map(
          ({ transitionKernelCode }) => transitionKernelCode !== "",
        ),
    ).toEqual([false, false, true]);
  });

  test("a change of a place reads the places of the net as often for 250 transitions as for 2", () => {
    const placeListReadsToRename = (transitionCount: number): number => {
      const { places, ...rest } = netOfKernels(transitionCount);
      let placeListReads = 0;
      const sdcpn = Object.defineProperty(rest, "places", {
        enumerable: true,
        get: () => {
          placeListReads += 1;
          return places;
        },
      }) as SDCPN;

      createPetrinautActions((change) => change(sdcpn)).updatePlace({
        placeId: "place-1",
        update: { name: "Renamed" },
      });

      expect(places[0]!.name).toBe("Renamed");
      return placeListReads;
    };

    expect(placeListReadsToRename(250)).toBe(placeListReadsToRename(2));
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
          component: { id: "component-1" },
          parameterValues: {},
          x: 100,
          y: 100,
        },
      ],
      components: [
        {
          id: "component-1",
          name: "Reusable component",
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
      targetComponentId: "component-1",
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
    instance.mutations.addComponent({
      id: "component-1",
      name: "Reusable component",
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
    expect(instance.definition.get().components).toEqual([
      {
        id: toPetrinautId("component-1"),
        name: "Reusable component",
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        componentInstances: [],
      },
    ]);
  });

  test("targets place mutations at a component when targetComponentId is provided", () => {
    const instance = createInstance();

    instance.mutations.addComponent({
      id: "component-1",
      name: "Reusable component",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      componentInstances: [],
    });
    instance.mutations.addPlace({
      targetComponentId: "component-1",
      id: "place-1",
      name: "Input",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    });
    instance.mutations.updatePlace({
      targetComponentId: "component-1",
      placeId: "place-1",
      update: { isPort: true },
    });

    const definition = instance.definition.get();
    expect(definition.places).toEqual([]);
    expect(definition.components?.[0]?.places).toEqual([
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
    components: [
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
        component: { id: "machine" },
        parameterValues: {},
        x: 0,
        y: 0,
      },
      {
        id: "m2",
        name: "M2",
        component: { id: "machine" },
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
        name: "Fusion 1",
        members: [
          port("m1", "in"),
          port("m2", "in"),
          { kind: "place", placeId: idOf("buffer") },
        ],
      },
    ]);
  });

  test("names a fusion added without a name `Fusion N`, with the lowest number free in its net", () => {
    const instance = createInstance(composed());
    const names = () =>
      instance.definition.get().fusions?.map(({ name }) => name);

    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "out"), port("m2", "in")],
    });
    expect(names()).toEqual(["Fusion 1", "Fusion 2"]);

    instance.mutations.removeFusion({ fusionId: "f1" });
    instance.mutations.addFusion({
      id: "f3",
      members: [{ kind: "place", placeId: "buffer" }, port("m2", "out")],
    });
    expect(names()).toEqual(["Fusion 2", "Fusion 1"]);
  });

  test("keeps the name a fusion is added with, and numbers around it", () => {
    const instance = createInstance(composed());

    instance.mutations.addFusion({
      id: "f1",
      name: "Fusion 1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "out"), port("m2", "in")],
    });

    expect(instance.definition.get().fusions?.map(({ name }) => name)).toEqual([
      "Fusion 1",
      "Fusion 2",
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

  test("replaces a member in one change, keeping a fusion of two", () => {
    const instance = createInstance(composed());
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });

    instance.mutations.replaceFusionMember({
      fusionId: "f1",
      member: port("m1", "in"),
      replacement: port("m2", "in"),
    });

    expect(instance.definition.get().fusions).toEqual([
      {
        id: idOf("f1"),
        name: "Fusion 1",
        members: [{ kind: "place", placeId: idOf("buffer") }, port("m2", "in")],
      },
    ]);
    instance.handle.history!.undo();
    expect(instance.definition.get().fusions?.[0]?.members).toEqual([
      { kind: "place", placeId: idOf("buffer") },
      port("m1", "in"),
    ]);
  });

  test("replaces a member with one of another fusion, which it absorbs", () => {
    const instance = createInstance(composed());
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });
    instance.mutations.addFusion({
      id: "f2",
      members: [port("m1", "out"), port("m2", "in")],
    });

    instance.mutations.replaceFusionMember({
      fusionId: "f1",
      member: port("m1", "in"),
      replacement: port("m2", "in"),
    });

    expect(instance.definition.get().fusions).toEqual([
      {
        id: idOf("f1"),
        name: "Fusion 1",
        members: [
          { kind: "place", placeId: idOf("buffer") },
          port("m1", "out"),
          port("m2", "in"),
        ],
      },
    ]);
  });

  test("refuses to replace a member the fusion does not hold, or with a second anchor", () => {
    const definition = composed();
    definition.places.push({ ...definition.places[0]!, id: "store" });
    const instance = createInstance(definition);
    instance.mutations.addFusion({
      id: "f1",
      members: [{ kind: "place", placeId: "buffer" }, port("m1", "in")],
    });

    expect(() =>
      instance.mutations.replaceFusionMember({
        fusionId: "f1",
        member: port("m2", "in"),
        replacement: port("m2", "out"),
      }),
    ).toThrow("does not hold the member to replace");
    // Replacing a member with one the fusion holds would be a removal.
    expect(() =>
      instance.mutations.replaceFusionMember({
        fusionId: "f1",
        member: port("m1", "in"),
        replacement: { kind: "place", placeId: "buffer" },
      }),
    ).toThrow("already holds the replacement");
    expect(instance.definition.get().fusions?.[0]?.members).toHaveLength(2);
    expect(() =>
      instance.mutations.replaceFusionMember({
        fusionId: "f1",
        member: port("m1", "in"),
        replacement: { kind: "place", placeId: "store" },
      }),
    ).toThrow();
    expect(() =>
      instance.mutations.replaceFusionMember({
        fusionId: "missing",
        member: port("m1", "in"),
        replacement: port("m2", "in"),
      }),
    ).toThrow("does not exist in the target net");

    // The anchor itself gives way to another place.
    instance.mutations.replaceFusionMember({
      fusionId: "f1",
      member: { kind: "place", placeId: "buffer" },
      replacement: { kind: "place", placeId: "store" },
    });
    expect(instance.definition.get().fusions?.[0]?.members).toEqual([
      port("m1", "in"),
      { kind: "place", placeId: idOf("store") },
    ]);
  });

  test("rejects a port that does not exist, a place that is not a port, a member twice and a second anchor", () => {
    const definition = composed();
    definition.places.push({ ...definition.places[0]!, id: "store" });
    definition.components![0]!.places.push({
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

  test("renames a fusion and describes it, clears the description, and refuses to leave it unnamed", () => {
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
      update: { description: undefined },
    });
    expect(fusion()).not.toHaveProperty("description");

    for (const name of ["", "  "]) {
      expect(() =>
        instance.mutations.updateFusion({ fusionId: "f1", update: { name } }),
      ).toThrow(/Name cannot be empty/);
    }
    expect(() =>
      instance.mutations.updateFusion({
        fusionId: "f1",
        update: { name: undefined },
      }),
    ).toThrow(/expected string, received undefined/);
    expect(fusion()?.name).toBe("Belt");
  });

  test("names a fusion the document was loaded with one member of", () => {
    const instance = createInstance({
      ...composed(),
      fusions: [{ id: "f1", name: "F1", members: [port("m1", "in")] }],
    });

    instance.mutations.updateFusion({
      fusionId: "f1",
      update: { name: "Belt" },
    });

    expect(instance.definition.get().fusions?.[0]).toMatchObject({
      name: "Belt",
      members: [port("m1", "in")],
    });
  });

  test("renames a component the document was loaded with a one-member fusion in", () => {
    const definition = composed();
    definition.components![0]!.fusions = [
      { id: "f1", name: "F1", members: [{ kind: "place", placeId: "in" }] },
    ];
    const instance = createInstance(definition);

    instance.mutations.updateComponent({
      componentId: "machine",
      update: { name: "Press" },
    });

    expect(instance.definition.get().components?.[0]).toMatchObject({
      name: "Press",
      fusions: [{ id: idOf("f1"), members: [{ placeId: idOf("in") }] }],
    });
  });

  describe("a one-member fusion the document was loaded with", () => {
    /**
     * `Lone` holds `M1.In` alone. `Belt` fuses the buffer with `M2.In` and
     * `M2.Out`. Nothing names the place `Store` or the instance `M3`.
     */
    const loaded = (): SDCPN => {
      const definition = composed();
      definition.places.push({
        ...definition.places[0]!,
        id: "store",
        name: "Store",
      });
      definition.componentInstances!.push({
        ...definition.componentInstances![0]!,
        id: "m3",
        name: "M3",
      });
      definition.fusions = [
        { id: "lone", name: "Lone", members: [port("m1", "in")] },
        {
          id: "belt",
          name: "Belt",
          members: [
            { kind: "place", placeId: "buffer" },
            port("m2", "in"),
            port("m2", "out"),
          ],
        },
      ];
      return definition;
    };

    type Mutations = ReturnType<typeof createInstance>["mutations"];
    type Edit = (mutations: Mutations) => void;

    const fusionIdsAfter = (edit: Edit) => {
      const instance = createInstance(loaded());
      edit(instance.mutations);
      return instance.definition.get().fusions?.map(({ id }) => id);
    };

    test.each<[string, Edit]>([
      [
        "an unrelated place is removed",
        (mutations) => mutations.removePlace({ placeId: "store" }),
      ],
      [
        "an unrelated instance is removed",
        (mutations) => mutations.removeComponentInstance({ instanceId: "m3" }),
      ],
      [
        "unrelated items are deleted by id",
        (mutations) =>
          mutations.deleteItemsByIds({
            items: [
              { type: "place", id: "store" },
              { type: "componentInstance", id: "m3" },
            ],
          }),
      ],
      [
        "another fusion loses a member",
        (mutations) =>
          mutations.removeFusionMember({
            fusionId: "belt",
            member: port("m2", "out"),
          }),
      ],
      [
        "a member it does not hold is taken out of it",
        (mutations) =>
          mutations.removeFusionMember({
            fusionId: "lone",
            member: port("m2", "in"),
          }),
      ],
    ])("stays when %s", (_case, edit) => {
      expect(fusionIdsAfter(edit)).toEqual([idOf("lone"), idOf("belt")]);
    });

    test.each<[string, Edit]>([
      [
        "another fusion is removed",
        (mutations) => mutations.removeFusion({ fusionId: "belt" }),
      ],
      [
        "another fusion is deleted by id",
        (mutations) =>
          mutations.deleteItemsByIds({
            items: [{ type: "fusion", id: "belt" }],
          }),
      ],
      [
        "an edit takes another fusion below two members",
        (mutations) => mutations.removeComponentInstance({ instanceId: "m2" }),
      ],
    ])("stays alone when %s", (_case, edit) => {
      expect(fusionIdsAfter(edit)).toEqual([idOf("lone")]);
    });

    test.each<[string, Edit]>([
      [
        "its member is taken out of it",
        (mutations) =>
          mutations.removeFusionMember({
            fusionId: "lone",
            member: port("m1", "in"),
          }),
      ],
      [
        "the instance of its member is removed",
        (mutations) => mutations.removeComponentInstance({ instanceId: "m1" }),
      ],
    ])("goes when %s", (_case, edit) => {
      expect(fusionIdsAfter(edit)).toEqual([idOf("belt")]);
    });
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
      targetComponentId: "machine",
      update: { isPort: false },
    });
    expect(instance.definition.get().fusions).toBeUndefined();
  });

  test("an instance pointed at another component leaves the fusions and arcs on its old ports", () => {
    const definition = composed();
    definition.components!.push({
      ...definition.components![0]!,
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
      update: { component: { id: "press" } },
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
      targetComponentId: "machine",
      update: { portDirection: "in" },
    });
    expect(
      instance.definition.get().components?.[0]?.places[0]?.portDirection,
    ).toBe("in");

    instance.mutations.updatePlace({
      placeId: "in",
      targetComponentId: "machine",
      update: { isPort: false },
    });
    expect(
      instance.definition.get().components?.[0]?.places[0]?.portDirection,
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

  describe("updates that take arcs and fusion memberships with them", () => {
    /** `M1.In` takes an arc and `M1.Out` is fused; nothing names a port of `M2`. */
    const wired = (): SDCPN => {
      const definition = composed();
      definition.components!.push({
        ...definition.components![0]!,
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
      definition.fusions = [
        {
          id: "f1",
          name: "F1",
          members: [{ kind: "place", placeId: "buffer" }, port("m1", "out")],
        },
      ];
      return definition;
    };

    const references = (document: SDCPN): number =>
      document.transitions.reduce(
        (count, { inputArcs, outputArcs }) =>
          count + inputArcs.length + outputArcs.length,
        0,
      ) +
      (document.fusions ?? []).reduce(
        (count, { members }) => count + members.length,
        0,
      );

    const unmark = (placeId: string, update: object = { isPort: false }) =>
      ({
        action: "updatePlace",
        input: { placeId, targetComponentId: "machine", update },
      }) as const;
    const repoint = (instanceId: string, update: object) =>
      ({
        action: "updateComponentInstance",
        input: { instanceId, update },
      }) as const;

    test.each([
      ["unmarking a port an arc reaches", unmark("in"), true],
      ["unmarking a port a fusion holds", unmark("out"), true],
      [
        "clearing the mark of such a port",
        unmark("in", { isPort: undefined }),
        true,
      ],
      ["renaming such a port", unmark("in", { name: "Inlet" }), false],
      ["marking it a port again", unmark("in", { isPort: true }), false],
      [
        "pointing a wired instance at another component",
        repoint("m1", { component: { id: "press" } }),
        true,
      ],
      [
        "pointing it at the component it has",
        repoint("m1", { component: { id: "machine" } }),
        false,
      ],
      ["renaming a wired instance", repoint("m1", { name: "Mill" }), false],
      [
        "pointing an instance nothing names at another component",
        repoint("m2", { component: { id: "press" } }),
        false,
      ],
    ])("%s", (_case, { action, input }, prunes) => {
      const instance = createInstance(wired());
      const before = instance.definition.get();

      expect(updatePrunesReferences(before, action, input)).toBe(prunes);

      // What the check says is what the mutation then does.
      const mutate = instance.mutations[action] as (input: unknown) => void;
      mutate(input);
      expect(references(instance.definition.get()) < references(before)).toBe(
        prunes,
      );
    });

    test("unmarking a port nothing outside its component names takes nothing", () => {
      const definition = wired();
      definition.transitions = [];
      delete definition.fusions;
      const { action, input } = unmark("in");

      expect(updatePrunesReferences(definition, action, input)).toBe(false);
    });

    test("an update of a place of the root net, or of what is not there, takes nothing", () => {
      const document = createInstance(wired()).definition.get();

      expect(
        updatePrunesReferences(document, "updatePlace", {
          placeId: "buffer",
          update: { isPort: false },
        }),
      ).toBe(false);
      expect(
        updatePrunesReferences(document, "updatePlace", {
          placeId: "in",
          targetComponentId: "missing",
          update: { isPort: false },
        }),
      ).toBe(false);
      expect(
        updatePrunesReferences(document, "updateComponentInstance", {
          instanceId: "missing",
          update: { component: { id: "press" } },
        }),
      ).toBe(false);
      expect(updatePrunesReferences(document, "removePlace", {})).toBe(false);
    });
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

  const stageComponent = (
    id: string,
    extra: Partial<Component> = {},
  ): Component => ({
    id,
    name: id,
    places: [port(`${id}_in`, "In"), port(`${id}_out`, "Out")],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    ...extra,
  });

  const defaultOf = (interfaceId: string, componentId: string) => ({
    interface: { id: interfaceId },
    component: { id: componentId },
  });

  const withInterface = (): SDCPN => ({
    ...emptySDCPN,
    components: [
      stageComponent("stage", { interface: true }),
      stageComponent("fast", { implements: ["stage"] }),
      stageComponent("slow", { implements: ["stage"] }),
      stageComponent("other"),
    ],
    componentInstances: [
      {
        id: "s1",
        name: "S1",
        component: { id: "stage" },
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
    expect(instance.definition.get().implementations).toEqual([
      defaultOf(idOf("stage"), idOf("fast")),
    ]);

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
    const base = withInterface();
    const instance = createInstance({
      ...base,
      components: [
        ...(base.components ?? []),
        stageComponent("draft", { interface: true, implements: ["stage"] }),
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
        update: { implementation: { id: "draft" } },
      }),
    ).toThrow(/which is an interface itself/);
    // An instance of a component has nothing to choose.
    expect(() =>
      instance.mutations.addComponentInstance({
        id: "o1",
        name: "O1",
        component: { id: "other" },
        implementation: { id: "fast" },
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
        implementation: { id: "other" },
      })),
    });

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { name: "Renamed" },
    });
    expect(instance.definition.get().componentInstances?.[0]).toMatchObject({
      name: "Renamed",
      implementation: { id: idOf("other") },
    });
    // Naming the component it already has makes no choice either.
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { component: { id: "stage" } },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toEqual({ id: idOf("other") });
    // Making the same choice again is held to the rule.
    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: { id: "other" } },
      }),
    ).toThrow(/does not implement/);
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: { id: "fast" } },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toEqual({ id: idOf("fast") });
  });

  test("a component that stops being an interface is implemented by none", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateComponent({
      componentId: "stage",
      update: { interface: undefined },
    });
    for (const id of ["fast", "slow"]) {
      expect(
        instance.definition
          .get()
          .components?.find((component) => component.id === idOf(id)),
      ).not.toHaveProperty("implements");
    }
  });

  test("an instance pointed at another component lets go of its implementation", () => {
    const instance = createInstance(withInterface());
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: { id: "fast" } },
    });

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { component: { id: "other" } },
    });
    expect(instance.definition.get().componentInstances?.[0]).toMatchObject({
      component: { id: idOf("other") },
    });
    expect(
      instance.definition.get().componentInstances?.[0],
    ).not.toHaveProperty("implementation");
  });

  test("a change to one component leaves the defaults of the others as they are", () => {
    const instance = createInstance({
      ...withInterface(),
      // Loaded as is: `other` does not say it implements the stage.
      implementations: [defaultOf("stage", "other")],
    });
    const patches: unknown[] = [];
    instance.handle.subscribe((event) =>
      patches.push(...(event.patches ?? [])),
    );

    instance.mutations.updateComponent({
      componentId: "slow",
      update: { name: "Slower" },
    });
    expect(instance.definition.get().implementations).toEqual([
      defaultOf(idOf("stage"), idOf("other")),
    ]);
    expect(JSON.stringify(patches)).not.toContain("implementations");

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "fast",
    });
    expect(JSON.stringify(patches)).toContain("implementations");
  });

  test("setting a default leaves one entry for the interface, whatever was loaded", () => {
    const instance = createInstance({
      ...withInterface(),
      components: [
        ...(withInterface().components ?? []),
        stageComponent("gate", { interface: true }),
        stageComponent("barrier", { implements: ["gate"] }),
      ],
      implementations: [
        defaultOf("stage", "fast"),
        defaultOf("gate", "barrier"),
        defaultOf("stage", "slow"),
      ],
    });

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "slow",
    });
    expect(instance.definition.get().implementations).toEqual([
      defaultOf(idOf("gate"), idOf("barrier")),
      defaultOf(idOf("stage"), idOf("slow")),
    ]);

    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: null,
    });
    expect(instance.definition.get().implementations).toEqual([
      defaultOf(idOf("gate"), idOf("barrier")),
    ]);
  });

  test("renaming a component keeps the stale bindings a document was loaded with", () => {
    const loaded = withInterface();
    // Loaded as is: `other` does not say it implements the stage.
    const instance = createInstance({
      ...loaded,
      implementations: [defaultOf("stage", "other")],
      componentInstances: loaded.componentInstances?.map((existing) => ({
        ...existing,
        implementation: { id: "other" },
      })),
    });

    // The binding names both components: as its implementation, as its
    // interface.
    for (const componentId of ["other", "stage"]) {
      instance.mutations.updateComponent({
        componentId,
        update: { name: `${componentId} renamed` },
      });
    }
    expect(instance.definition.get().implementations).toEqual([
      defaultOf(idOf("stage"), idOf("other")),
    ]);
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toEqual({ id: idOf("other") });
  });

  test("refuses a component that implements something that is no interface", () => {
    const instance = createInstance(withInterface());

    expect(() =>
      instance.mutations.updateComponent({
        componentId: "other",
        update: { implements: ["missing"] },
      }),
    ).toThrow(/which does not exist/);
    expect(() =>
      instance.mutations.addComponent(
        stageComponent("another", { implements: ["fast"] }),
      ),
    ).toThrow(/which is not an interface/);
  });

  test("refuses an interface that implements an interface", () => {
    const instance = createInstance(withInterface());
    const refusal = /an interface cannot implement an interface/;

    expect(() =>
      instance.mutations.addComponent(
        stageComponent("draft", { interface: true, implements: ["stage"] }),
      ),
    ).toThrow(refusal);
    expect(() =>
      instance.mutations.updateComponent({
        componentId: "fast",
        update: { interface: true },
      }),
    ).toThrow(refusal);

    instance.mutations.addComponent(
      stageComponent("draft", { interface: true }),
    );
    expect(() =>
      instance.mutations.updateComponent({
        componentId: "draft",
        update: { implements: ["stage"] },
      }),
    ).toThrow(refusal);

    // One update may turn an implementation into an interface.
    instance.mutations.updateComponent({
      componentId: "fast",
      update: { interface: true, implements: undefined },
    });
    expect(
      instance.definition
        .get()
        .components?.find(({ id }) => id === idOf("fast")),
    ).toMatchObject({ interface: true });
  });

  test("an interface loaded as implementing one is still edited, and repaired", () => {
    const base = withInterface();
    const instance = createInstance({
      ...base,
      components: [
        ...(base.components ?? []),
        stageComponent("draft", { interface: true, implements: ["stage"] }),
      ],
    });

    instance.mutations.updateComponent({
      componentId: "draft",
      update: { name: "Draft" },
    });
    instance.mutations.updateComponent({
      componentId: "draft",
      update: { implements: undefined },
    });
    expect(
      instance.definition
        .get()
        .components?.find(({ id }) => id === idOf("draft")),
    ).not.toHaveProperty("implements");
  });

  test("lets an instance choose and clear its own implementation", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: { id: "slow" } },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toEqual({ id: idOf("slow") });

    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: { id: "other" } },
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

  test("a component that stops implementing an interface, or being one, leaves no binding behind", () => {
    const bound = () => {
      const instance = createInstance(withInterface());
      instance.mutations.setImplementation({
        interfaceId: "stage",
        implementationId: "fast",
      });
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: { id: "fast" } },
      });
      return instance;
    };

    const unticked = bound();
    unticked.mutations.updateComponent({
      componentId: "fast",
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
    demoted.mutations.updateComponent({
      componentId: "stage",
      update: { interface: undefined },
    });
    expect(demoted.definition.get().implementations).toBeUndefined();
    expect(demoted.definition.get().componentInstances?.[0]).not.toHaveProperty(
      "implementation",
    );
  });

  test("removing a component drops the bindings and implements entries that named it", () => {
    const instance = createInstance(withInterface());
    instance.mutations.setImplementation({
      interfaceId: "stage",
      implementationId: "fast",
    });
    instance.mutations.updateComponentInstance({
      instanceId: "s1",
      update: { implementation: { id: "fast" } },
    });

    instance.mutations.removeComponent({ componentId: "fast" });
    const definition = instance.definition.get();
    expect(definition.implementations).toBeUndefined();
    expect(definition.componentInstances?.[0]?.implementation).toBeUndefined();

    instance.mutations.removeComponent({ componentId: "stage" });
    expect(
      instance.definition
        .get()
        .components?.find(({ id }) => id === idOf("slow"))?.implements,
    ).toBeUndefined();
  });

  test("clearing the interface flag deletes it", () => {
    const instance = createInstance(withInterface());

    instance.mutations.updateComponent({
      componentId: "stage",
      update: { interface: undefined },
    });
    expect(
      instance.definition
        .get()
        .components?.find(({ id }) => id === idOf("stage"))?.interface,
    ).toBeUndefined();
  });

  describe("an update that arrives as JSON", () => {
    const fromJson = (json: string): unknown => JSON.parse(json);

    test("clears an instance's choice with null, and keeps it when it names none", () => {
      const instance = createInstance(withInterface());
      const placed = () => instance.definition.get().componentInstances?.[0];
      instance.mutations.updateComponentInstance({
        instanceId: "s1",
        update: { implementation: { id: "slow" } },
      });

      callActionWithUnknownInput(
        instance.mutations.updateComponentInstance,
        fromJson('{"instanceId":"s1","update":{"name":"Renamed"}}'),
      );
      expect(placed()).toMatchObject({
        name: "Renamed",
        implementation: { id: idOf("slow") },
      });

      callActionWithUnknownInput(
        instance.mutations.updateComponentInstance,
        fromJson('{"instanceId":"s1","update":{"implementation":null}}'),
      );
      expect(placed()).not.toHaveProperty("implementation");
    });

    test("makes an interface an ordinary component again with false", () => {
      const instance = createInstance(withInterface());
      const componentOf = (id: string) =>
        instance.definition
          .get()
          .components?.find((component) => component.id === idOf(id));
      instance.mutations.setImplementation({
        interfaceId: "stage",
        implementationId: "fast",
      });

      callActionWithUnknownInput(
        instance.mutations.updateComponent,
        fromJson('{"componentId":"stage","update":{"interface":false}}'),
      );
      expect(componentOf("stage")).not.toHaveProperty("interface");
      // What rested on the interface goes with the flag, however it is cleared.
      expect(componentOf("fast")).not.toHaveProperty("implements");
      expect(instance.definition.get().implementations).toBeUndefined();

      callActionWithUnknownInput(
        instance.mutations.updateComponent,
        fromJson('{"componentId":"other","update":{"interface":true}}'),
      );
      expect(componentOf("other")).toMatchObject({ interface: true });
    });

    test("is the only place a clear is written: a stored instance or component holds none", () => {
      const [stage] = withInterface().components ?? [];
      const [placed] = withInterface().componentInstances ?? [];

      expect(
        mutationActionInputSchemas.updateComponentInstance.parse(
          fromJson('{"instanceId":"s1","update":{"implementation":null}}'),
        ).update,
      ).toEqual({ implementation: null });
      expect(
        mutationActionInputSchemas.updateComponent.parse(
          fromJson('{"componentId":"stage","update":{"interface":false}}'),
        ).update,
      ).toEqual({ interface: false });

      expect(
        componentInstanceSchema.safeParse({ ...placed, implementation: null })
          .success,
      ).toBe(false);
      expect(
        mutationActionInputSchemas.addComponentInstance.safeParse({
          ...placed,
          implementation: null,
        }).success,
      ).toBe(false);
      expect(
        componentSchema.safeParse({ ...stage, interface: false }).success,
      ).toBe(false);
    });
  });

  test("a component takes an icon and a colour, and clearing one deletes it", () => {
    const instance = createInstance(withInterface());
    const iconSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const fast = () =>
      instance.definition
        .get()
        .components?.find(({ id }) => id === idOf("fast"));

    instance.mutations.updateComponent({
      componentId: "fast",
      update: { iconSvg, displayColor: "#3b82f6" },
    });
    expect(fast()).toMatchObject({ iconSvg, displayColor: "#3b82f6" });

    instance.mutations.updateComponent({
      componentId: "fast",
      update: { iconSvg: undefined, displayColor: undefined },
    });
    expect(fast()).not.toHaveProperty("iconSvg");
    expect(fast()).not.toHaveProperty("displayColor");
  });

  test("an icon longer than the limit is refused", () => {
    const instance = createInstance(withInterface());

    expect(() =>
      instance.mutations.updateComponent({
        componentId: "fast",
        update: { iconSvg: `<svg>${" ".repeat(maxComponentIconLength)}</svg>` },
      }),
    ).toThrow();
  });

  test("an icon that holds anything but shapes is refused, naming the element", () => {
    const instance = createInstance(withInterface());
    // Each group draws the one before it twice: thirty of them ask for a
    // billion shapes.
    const groups = Array.from({ length: 30 }, (_, level) =>
      level === 0
        ? '<g id="g0"><rect width="1" height="1"/></g>'
        : `<g id="g${level}"><use href="#g${level - 1}"/><use href="#g${level - 1}"/></g>`,
    );

    for (const [iconSvg, element] of [
      [`<svg viewBox="0 0 8 8">${groups.join("")}</svg>`, "use"],
      ['<svg><USE href="#a"/></svg>', "USE"],
      [
        '<svg xmlns:s="http://www.w3.org/2000/svg"><s:use href="#a"/></svg>',
        "s:use",
      ],
      ["<svg><defs><clipPath/></defs></svg>", "defs"],
      ["<svg><script>alert(1)</script></svg>", "script"],
    ] as const) {
      expect(() =>
        instance.mutations.updateComponent({
          componentId: "fast",
          update: { iconSvg },
        }),
      ).toThrow(`\`${element}\``);
    }
  });
});

describe("Petrinaut core import actions", () => {
  const importing = (initial: SDCPN = emptySDCPN, known = true) =>
    createPetrinaut({
      document: createJsonDocHandle({ initial: cloneSDCPN(initial) }),
      resolveImport: () => (known ? logistics : undefined),
      libraries: [logistics.id],
    });

  const belt = { from: logistics.id, id: "belt" };
  const placed = {
    id: "belt-1",
    name: "BeltA",
    component: belt,
    parameterValues: {},
    x: 0,
    y: 0,
  };

  test("placing the first instance of a component of a library adds the import", () => {
    const instance = importing();

    instance.mutations.addComponentInstance(placed);
    instance.mutations.addComponentInstance({ ...placed, id: "belt-2" });

    const { imports, componentInstances, components } =
      instance.definition.get();
    expect(imports).toEqual([{ id: logistics.id }]);
    expect(componentInstances?.map(({ component }) => component)).toEqual([
      belt,
      belt,
    ]);
    // Nothing of the library is copied into the document.
    expect(components).toBeUndefined();
  });

  test("removing the last instance leaves the import in place", () => {
    const instance = importing();
    instance.mutations.addComponentInstance(placed);

    instance.mutations.removeComponentInstance({ instanceId: "belt-1" });

    expect(instance.definition.get().imports).toEqual([{ id: logistics.id }]);
  });

  test("an instance that names no component is refused", () => {
    const { component: _component, ...unnamed } = placed;

    expect(() =>
      callActionWithUnknownInput(
        importing().mutations.addComponentInstance,
        unnamed,
      ),
    ).toThrow("component");
  });

  test("a component its library does not have is refused, and so is one of a library that did not resolve", () => {
    expect(() =>
      importing().mutations.addComponentInstance({
        ...placed,
        component: { from: logistics.id, id: "crane" },
      }),
    ).toThrow(
      "Component instance `BeltA` references component `crane` of the import `@hashintel/logistics`, which is not available.",
    );
    expect(() =>
      importing(emptySDCPN, false).mutations.addComponentInstance(placed),
    ).toThrow("which is not available");
  });

  test("an instance whose component is not there to read is still edited, and held to the rule once an update names one", () => {
    const loaded = (component: { from: string; id: string }): SDCPN => ({
      ...emptySDCPN,
      imports: [{ id: logistics.id }],
      componentInstances: [{ ...placed, component }],
    });
    const crane = { from: logistics.id, id: "crane" };

    for (const [component, instance] of [
      // An import that failed.
      [belt, importing(loaded(belt), false)],
      // A component its library does not have.
      [crane, importing(loaded(crane))],
    ] as const) {
      instance.mutations.updateComponentInstance({
        instanceId: "belt-1",
        update: { name: "Renamed" },
      });
      instance.mutations.updateComponentInstancePosition({
        instanceId: "belt-1",
        position: { x: 40, y: 80 },
      });
      instance.mutations.updateComponentInstance({
        instanceId: "belt-1",
        update: { parameterValues: { rate: "4" } },
      });
      expect(instance.definition.get().componentInstances).toEqual([
        {
          id: idOf("belt-1"),
          name: "Renamed",
          component,
          parameterValues: { [idOf("rate")]: "4" },
          x: 40,
          y: 80,
        },
      ]);

      // Naming the component it already has is held to the rule.
      expect(() =>
        instance.mutations.updateComponentInstance({
          instanceId: "belt-1",
          update: { component },
        }),
      ).toThrow("which is not available");
      expect(() =>
        instance.mutations.updateComponentInstance({
          instanceId: "belt-1",
          update: { component: crane },
        }),
      ).toThrow(
        "Component instance `Renamed` references component `crane` of the import `@hashintel/logistics`, which is not available.",
      );
      expect(() =>
        instance.mutations.updateComponentInstance({
          instanceId: "belt-1",
          update: { component: { id: "nowhere" } },
        }),
      ).toThrow("references component ID `nowhere` which does not exist");
    }
  });

  test("parameter values are keyed by the component's parameters", () => {
    const instance = importing();

    instance.mutations.addComponentInstance({
      ...placed,
      parameterValues: { rate: "4" },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.parameterValues,
    ).toEqual({ [idOf("rate")]: "4" });

    expect(() =>
      instance.mutations.addComponentInstance({
        ...placed,
        id: "belt-2",
        parameterValues: { speed: "4" },
      }),
    ).toThrow("unknown component parameter ID");
  });

  test("a fusion joins a place with a port of a component of an import, by the port's id", () => {
    const instance = importing({
      ...emptySDCPN,
      places: [
        {
          id: "stock",
          name: "Stock",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
    });
    instance.mutations.addComponentInstance(placed);

    instance.mutations.addFusion({
      id: "feed",
      members: [
        { kind: "place", placeId: "stock" },
        {
          kind: "componentPort",
          componentInstanceId: "belt-1",
          portPlaceId: "in",
        },
      ],
    });

    expect(instance.definition.get().fusions?.[0]?.members[1]).toEqual({
      kind: "componentPort",
      componentInstanceId: idOf("belt-1"),
      portPlaceId: idOf("in"),
    });
    expect(() =>
      instance.mutations.addFusionMember({
        fusionId: "feed",
        member: {
          kind: "componentPort",
          componentInstanceId: "belt-1",
          portPlaceId: "spill",
        },
      }),
    ).toThrow("does not exist in component `Belt`");
  });

  test("pointing an instance at a component of an import drops its wiring and its choice, and adds the import", () => {
    const stage: Component = {
      id: "stage",
      name: "Stage",
      places: [
        {
          id: "stage-in",
          name: "In",
          colorId: null,
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const initial: SDCPN = {
      ...emptySDCPN,
      places: [
        {
          id: "stock",
          name: "Stock",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
      components: [stage],
      componentInstances: [
        {
          id: "worker",
          name: "Worker",
          component: { id: "stage" },
          parameterValues: {},
          x: 0,
          y: 0,
        },
      ],
      fusions: [
        {
          id: "feed",
          name: "Feed",
          members: [
            { kind: "place", placeId: "stock" },
            {
              kind: "componentPort",
              componentInstanceId: "worker",
              portPlaceId: "stage-in",
            },
          ],
        },
      ],
    };
    const instance = importing(initial);
    const update = { instanceId: "worker", update: { component: belt } };

    expect(
      updatePrunesReferences(
        instance.definition.get(),
        "updateComponentInstance",
        update,
      ),
    ).toBe(true);
    instance.mutations.updateComponentInstance(update);

    const definition = instance.definition.get();
    expect(definition.componentInstances?.[0]).toEqual({
      id: idOf("worker"),
      name: "Worker",
      component: belt,
      parameterValues: {},
      x: 0,
      y: 0,
    });
    expect(definition.fusions).toBeUndefined();
    expect(definition.imports).toEqual([{ id: logistics.id }]);
  });

  test("an instance of an interface of an import chooses a component of the import to run", () => {
    const instance = importing();
    instance.mutations.addComponentInstance({
      ...placed,
      id: "scale-1",
      component: { from: logistics.id, id: "scale" },
    });

    instance.mutations.updateComponentInstance({
      instanceId: "scale-1",
      update: { implementation: belt },
    });
    expect(
      instance.definition.get().componentInstances?.[0]?.implementation,
    ).toEqual(belt);

    expect(() =>
      instance.mutations.updateComponentInstance({
        instanceId: "scale-1",
        update: { implementation: { from: logistics.id, id: "scale" } },
      }),
    ).toThrow("which is an interface itself");
  });

  test("choosing a component of a library as an instance's implementation adds the import", () => {
    const stage: Component = {
      id: "stage",
      name: "Stage",
      interface: true,
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const held = {
      id: "stage-1",
      name: "StageA",
      component: { id: "stage" },
      parameterValues: {},
      x: 0,
      y: 0,
    };

    const placing = importing({ ...emptySDCPN, components: [stage] });
    placing.mutations.addComponentInstance({ ...held, implementation: belt });
    expect(placing.definition.get().imports).toEqual([{ id: logistics.id }]);

    const choosing = importing({
      ...emptySDCPN,
      components: [stage],
      componentInstances: [held],
    });
    choosing.mutations.updateComponentInstance({
      instanceId: "stage-1",
      update: { implementation: belt },
    });
    expect(choosing.definition.get().imports).toEqual([{ id: logistics.id }]);
  });

  test("a transition's default kernel takes each port's token type from its own library, whatever ids two libraries share", () => {
    const north = gateLibrary("@hashintel/north", {
      name: "weight",
      type: "real",
    });
    const south = gateLibrary("@hashintel/south", {
      name: "count",
      type: "integer",
    });
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: cloneSDCPN(emptySDCPN) }),
      resolveImport: (id) =>
        [north, south].find((library) => library.id === id),
      libraries: [north.id, south.id],
    });
    for (const [id, library] of [
      ["north-1", north],
      ["south-1", south],
    ] as const) {
      instance.mutations.addComponentInstance({
        ...placed,
        id,
        name: id === "north-1" ? "North" : "South",
        component: { from: library.id, id: "gate" },
      });
    }

    instance.mutations.addTransition({
      id: "sort",
      name: "Sort",
      inputArcs: [],
      outputArcs: ["north-1", "south-1"].map((componentInstanceId) => ({
        endpoint: {
          kind: "componentPort" as const,
          componentInstanceId,
          portPlaceId: "in",
        },
        weight: 1,
      })),
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    });

    const code = instance.definition
      .get()
      .transitions.find(({ id }) => id === idOf("sort"))?.transitionKernelCode;
    expect(code).toContain("{ weight: ");
    expect(code).toContain("{ count: ");
  });

  test("a transition's default kernel takes a port's token type from the body of its library, and a place's from the document, when both write one id for a type", () => {
    const tanks = tankLibrary("@hashintel/tanks", {
      name: "level",
      type: "real",
    });
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: cloneSDCPN({
          ...emptySDCPN,
          // The id the body of `tank` writes for its type, with other fields.
          types: [
            {
              id: "fluid",
              name: "Fluid",
              iconSlug: "circle",
              displayColor: "#000",
              elements: [
                { elementId: "count", name: "count", type: "integer" },
              ],
            },
          ],
          places: [
            {
              id: "shelf",
              name: "Shelf",
              colorId: "fluid",
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
          ],
        }),
      }),
      resolveImport: () => tanks,
      libraries: [tanks.id],
    });
    instance.mutations.addComponentInstance({
      ...placed,
      id: "tank-1",
      name: "TankA",
      component: { from: tanks.id, id: "tank" },
    });

    const kernelOnto = (id: string, endpoint: ArcEndpoint) => {
      instance.mutations.addTransition({
        id,
        name: id,
        inputArcs: [],
        outputArcs: [{ endpoint, weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 0,
        y: 0,
      });
      return instance.definition
        .get()
        .transitions.find((transition) => transition.id === idOf(id))
        ?.transitionKernelCode;
    };

    expect(
      kernelOnto("pour", {
        kind: "componentPort",
        componentInstanceId: "tank-1",
        portPlaceId: "in",
      }),
    ).toContain("In: [\n    { level: ");
    expect(kernelOnto("stack", { kind: "place", placeId: "shelf" })).toContain(
      "Shelf: [\n    { count: ",
    );
  });

  test("a transition keeps the code written for a port of a component whose library is not there to read", () => {
    const initial: SDCPN = {
      ...emptySDCPN,
      imports: [{ id: logistics.id }],
      transitions: [
        {
          id: "load",
          name: "Load",
          inputArcs: [],
          outputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "belt-1",
                portPlaceId: "in",
              },
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: "return true;",
          transitionKernelCode: "return { In: [{}] };",
          x: 0,
          y: 0,
        },
      ],
      componentInstances: [placed],
    };
    const instance = importing(initial, false);

    expect(instance.definition.get().transitions[0]).toMatchObject({
      transitionKernelCode: "return { In: [{}] };",
    });
    instance.mutations.updateTransition({
      transitionId: "load",
      update: { name: "Fill" },
    });
    expect(instance.definition.get().transitions[0]).toMatchObject({
      name: "Fill",
      transitionKernelCode: "return { In: [{}] };",
    });
  });
});
