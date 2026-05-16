import { describe, expect, it } from "vitest";

import type { Color, Place, Transition } from "../../types/sdcpn";
import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import { computePossibleTransition as computePossibleTransitionImpl } from "./compute-possible-transition";
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
    name: "Transition 1",
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
          inputPlaces: transition.inputArcs.map((arc) => ({
            placeId: arc.placeId,
            placeName: placesMap.get(arc.placeId)?.name ?? arc.placeId,
            weight: arc.weight,
            arcType: arc.type,
            elementNames: getElementNames(arc.placeId),
          })),
          outputPlaces: transition.outputArcs.map((arc) => ({
            placeId: arc.placeId,
            placeName: placesMap.get(arc.placeId)?.name ?? arc.placeId,
            weight: arc.weight,
            elementNames: getElementNames(arc.placeId),
          })),
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

function computePossibleTransition(
  frame: TestFrame,
  simulation: SimulationInstance,
  transitionId: string,
  rngState: number,
) {
  return computePossibleTransitionImpl(
    frame,
    { ...simulation, frameLayout: frame.layout },
    transitionId,
    rngState,
  );
}

describe("computePossibleTransition", () => {
  it("returns null when transition is not enabled due to insufficient tokens", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 2, type: "standard" }],
      outputArcs: [],
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
        p1: { offset: 0, count: 1, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0]),
    });

    expect(computePossibleTransition(frame, simulation, "t1", 42)).toBeNull();
  });

  it("returns null when inhibitor arc condition is not met", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
      outputArcs: [],
    });
    const simulation = makeSimulation({
      transitions: [transition],
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({})],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 2, dimensions: 0 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([]),
    });

    expect(computePossibleTransition(frame, simulation, "t1", 42)).toBeNull();
  });

  it("does not consume tokens from inhibitor arc when transition fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "inhibitor" },
      ],
      outputArcs: [{ placeId: "p3", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return { Target: [{ x: 5.0 }] };",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", null),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ Target: [{ x: 5.0 }] })],
      ]),
    });
    const frame = makeFrame({
      places: {
        p1: { offset: 0, count: 1, dimensions: 1 },
        p2: { offset: 1, count: 0, dimensions: 0 },
        p3: { offset: 1, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([3.0]),
    });

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result!.remove).toHaveProperty("p1");
    expect(result!.remove).not.toHaveProperty("p2");
    expect(result!.add).toMatchObject({ p3: [[5.0]] });
  });

  it("returns token combinations when transition is enabled and fires", () => {
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

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      remove: { p1: new Set([0]) },
      add: { p2: [[2.0]] },
    });
    expect(result?.newRngState).toBeTypeOf("number");
  });
});
