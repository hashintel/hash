import { describe, expect, it } from "vitest";

import { getArcEndpointPlaceId } from "../../arc-endpoints";
import {
  createEngineFrame,
  createEngineFrameLayout,
  materializeEngineFrame,
  type EngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import { executeTransitions as executeEngineTransitions } from "./execute-transitions";

import type { Color, Place, Transition } from "../../types/sdcpn";
import type {
  CompiledTransition,
  EngineFrame,
  LambdaFn,
  SimulationInstance,
  TransitionKernelFn,
} from "./types";

const type1: Color = {
  id: "type1",
  name: "Type1",
  iconSlug: "circle",
  displayColor: "#FF0000",
  elements: [{ elementId: "e1", name: "x", type: "real" }],
};

const type2: Color = {
  id: "type2",
  name: "Type2",
  iconSlug: "square",
  displayColor: "#00FF00",
  elements: [
    { elementId: "e1", name: "x", type: "real" },
    { elementId: "e2", name: "y", type: "real" },
  ],
};

const transitionState = (timeSinceLastFiringMs = 1.0) => ({
  timeSinceLastFiringMs,
  firedInThisFrame: false,
  firingCount: 0,
});

type TestFrame = EngineFrame & { layout: EngineFrameLayout };

function makePlace(id: string, name: string, colorId: string | null): Place {
  return {
    id,
    name,
    colorId,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  };
}

function makeColor(dimensions: number): Color {
  return {
    id: `frame-type-${dimensions}`,
    name: `Frame Type ${dimensions}`,
    iconSlug: "circle",
    displayColor: "#000000",
    elements: Array.from({ length: dimensions }, (_, index) => ({
      elementId: `d${index}`,
      name: `d${index}`,
      type: "real",
    })),
  };
}

function makeTransition(
  transition: Pick<Transition, "id" | "inputArcs" | "outputArcs"> &
    Partial<Omit<Transition, "id" | "inputArcs" | "outputArcs">>,
): Transition {
  return {
    name: "Transition",
    lambdaType: "stochastic",
    lambdaCode: "return 1.0;",
    transitionKernelCode: "return {};",
    x: 0,
    y: 0,
    ...transition,
  };
}

function makeCompiledTransitions({
  places,
  transitions,
  types,
  lambdaFns,
  transitionKernelFns,
}: {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  lambdaFns: ReadonlyMap<string, LambdaFn>;
  transitionKernelFns: ReadonlyMap<string, TransitionKernelFn>;
}): Map<string, CompiledTransition> {
  const placesMap = new Map(places.map((place) => [place.id, place]));
  const typesMap = new Map(types.map((type) => [type.id, type]));
  const getElementNames = (placeId: string) => {
    const place = placesMap.get(placeId);
    if (!place?.colorId) {
      return null;
    }

    return (
      typesMap.get(place.colorId)?.elements.map((element) => element.name) ??
      null
    );
  };
  const getElements = (placeId: string) => {
    const place = placesMap.get(placeId);
    if (!place?.colorId) {
      return null;
    }

    return typesMap.get(place.colorId)?.elements ?? null;
  };

  return new Map(
    transitions.map((transition) => {
      const lambdaFn = lambdaFns.get(transition.id);
      const transitionKernelFn = transitionKernelFns.get(transition.id);
      if (!lambdaFn || !transitionKernelFn) {
        throw new Error(`Missing compiled functions for ${transition.id}`);
      }

      return [
        transition.id,
        {
          id: transition.id,
          name: transition.name,
          inputPlaces: transition.inputArcs.map((arc) => {
            const placeId = getArcEndpointPlaceId(arc)!;
            return {
              placeId,
              placeName: placesMap.get(placeId)?.name ?? placeId,
              weight: arc.weight,
              arcType: arc.type,
              elementNames: getElementNames(placeId),
              elements: getElements(placeId),
            };
          }),
          outputPlaces: transition.outputArcs.map((arc) => {
            const placeId = getArcEndpointPlaceId(arc)!;
            return {
              placeId,
              placeName: placesMap.get(placeId)?.name ?? placeId,
              weight: arc.weight,
              elementNames: getElementNames(placeId),
              elements: getElements(placeId),
            };
          }),
          lambdaFn,
          transitionKernelFn,
        },
      ];
    }),
  );
}

function makeSimulation({
  places = [],
  transitions,
  types = [],
  lambdaFns,
  transitionKernelFns,
}: {
  places?: Place[];
  transitions: Transition[];
  types?: Color[];
  lambdaFns: ReadonlyMap<string, LambdaFn>;
  transitionKernelFns: ReadonlyMap<string, TransitionKernelFn>;
}): SimulationInstance {
  const frameLayout = createEngineFrameLayout({
    places,
    transitions,
    types,
  });

  return {
    places: new Map(places.map((place) => [place.id, place])),
    transitions: new Map(
      transitions.map((transition) => [transition.id, transition]),
    ),
    types: new Map(types.map((type) => [type.id, type])),
    differentialEquationFns: new Map(),
    compiledTransitions: makeCompiledTransitions({
      places,
      transitions,
      types,
      lambdaFns,
      transitionKernelFns,
    }),
    parameterValues: {},
    dt: 0.1,
    maxTime: null,
    currentTime: 0,
    rngState: 42,
    frameLayout,
    frames: [],
    currentFrameNumber: 0,
  };
}

function makeFrame(snapshot: EngineFrameSnapshot): TestFrame {
  const dimensions = new Set(
    Object.values(snapshot.places).map((place) => place.dimensions),
  );
  const layout = createEngineFrameLayout({
    places: Object.entries(snapshot.places).map(([id, place]) =>
      makePlace(
        id,
        id,
        place.dimensions === 0 ? null : `frame-type-${place.dimensions}`,
      ),
    ),
    transitions: Object.keys(snapshot.transitions).map((id) =>
      makeTransition({ id, inputArcs: [], outputArcs: [] }),
    ),
    types: [...dimensions]
      .filter((dimension) => dimension > 0)
      .map((dimension) => makeColor(dimension)),
  });
  const frame = createEngineFrame(layout, snapshot) as TestFrame;
  Object.defineProperty(frame, "layout", { value: layout });
  return frame;
}

function executeTransitions(
  frame: TestFrame,
  simulation: SimulationInstance,
  dt: number,
  rngState: number,
) {
  const result = executeEngineTransitions(
    frame,
    { ...simulation, frameLayout: frame.layout },
    dt,
    rngState,
  );

  return {
    ...result,
    frame:
      result.frame === frame
        ? (frame as unknown as EngineFrameSnapshot)
        : materializeEngineFrame(frame.layout, result.frame),
  };
}

describe("executeTransitions", () => {
  it("returns the original frame when no transitions can fire", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
    });
    const simulation = makeSimulation({
      transitions: [transition],
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ p2: [{ x: 1.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame).toBe(frame);
    expect(result.transitionFired).toBe(false);
  });

  it("removes tokens and adds new tokens when a single transition fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return [[[2.0]]];",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 1 },
        p2: { offset: 2, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0, 1.5]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(1.5);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[1]).toBe(2.0);
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.transitionFired).toBe(true);
  });

  it("keeps read arc tokens in the frame when a transition fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "read" },
      ],
      outputArcs: [{ placeId: "p3", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return { Target: input.Guard };",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", "type1"),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => true]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        [
          "t1",
          (input) => {
            const guardToken = input.Guard?.[0];
            if (guardToken?.x === undefined) {
              throw new Error("Expected read arc token");
            }
            return { Target: [{ x: guardToken.x }] };
          },
        ],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 1, dimensions: 1 },
        p2: { offset: 1, count: 1, dimensions: 1 },
        p3: { offset: 2, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([3.0, 7.0]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.transitionFired).toBe(true);
    expect(result.frame.places.p1?.count).toBe(0);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.places.p3?.count).toBe(1);
    expect(result.frame.buffer).toEqual(new Float64Array([7.0, 7.0]));
  });

  it("executes multiple transitions sequentially with proper token removal between each", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[5.0]]];",
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p3", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[10.0]]];",
      }),
    ];
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
        makePlace("p3", "Place 3", "type1"),
      ],
      transitions,
      types: [type1],
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 10.0],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 5.0 }] })],
        ["t2", () => ({ "Place 3": [{ x: 10.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 3, dimensions: 1 },
        p2: { offset: 3, count: 0, dimensions: 1 },
        p3: { offset: 3, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
        t2: transitionState(),
      },
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(1);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.places.p3?.count).toBe(1);
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0);
  });

  it("handles transitions with multi-dimensional tokens", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return [[[3.0, 4.0]]];",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type2"),
        makePlace("p2", "Place 2", "type2"),
      ],
      transitions: [transition],
      types: [type2],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 3.0, y: 4.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 1, dimensions: 2 },
        p2: { offset: 2, count: 0, dimensions: 2 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0, 2.0]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(0);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(3.0);
    expect(result.frame.buffer[1]).toBe(4.0);
  });

  it("updates timeSinceLastFiringMs for transitions that did not fire", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[2.0]]];",
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 0.001;",
        transitionKernelCode: "return [[[3.0]]];",
      }),
    ];
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions,
      types: [type1],
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 0.001],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
        ["t2", () => ({ "Place 2": [{ x: 3.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 1 },
        p2: { offset: 2, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(0.5),
        t2: transitionState(0.3),
      },
      buffer: new Float64Array([1.0, 1.5]),
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0.4);
  });
});
